/**
 * Game Flow Handlers
 * Functions for managing game progression
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  initializeHand,
  dealHoleCards,
  dealFlop,
  dealTurnOrRiver,
  processAction,
  getNextPlayer,
  calculateWinners,
} from '../engines/texasHoldem.js';
import { validateGameStart, validatePlayerAction } from '../utils/validators.js';

// Constants
const DEFAULT_BUY_IN = 1000;

/**
 * Start a new hand
 * @param {string} gameId - Game ID
 * @return {Promise<Object>} Updated game state
 */
export async function startHand(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    let game = gameDoc.data();

    // Validate can start
    const validation = validateGameStart(game);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Initialize new hand
    game = initializeHand(game);

    // Deal hole cards
    const { game: updatedGame, holeCards } = dealHoleCards(game);

    // Update game state with timestamp
    const updateData = {
      ...updatedGame,
      table: {
        ...updatedGame.table,
        turnStartedAt: FieldValue.serverTimestamp(),
      },
    };

    transaction.update(gameRef, updateData);

    // Store private hole cards
    Object.entries(holeCards).forEach(([playerId, cards]) => {
      const privateRef = gameRef.collection('private').doc(playerId);
      transaction.set(privateRef, { holeCards: cards });
    });

    return {
      gameId,
      handNumber: updatedGame.handNumber,
      currentTurn: updatedGame.table.currentTurn,
    };
  });
}

/**
 * Process player action
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {string} action - Action type
 * @param {number} amount - Bet amount
 * @return {Promise<Object>} Updated game state
 */
export async function handlePlayerAction(gameId, userId, action, amount = 0) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    let game = gameDoc.data();

    // Validate action
    const validation = validatePlayerAction(game, userId, action, amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Process the action
    game = processAction(game, userId, action, amount);

    // Record action in hand history
    const handRef = gameRef.collection('hands').doc(`hand_${game.handNumber}`);
    transaction.set(handRef, {
      handNumber: game.handNumber,
      actions: FieldValue.arrayUnion({
        odId: userId,
        action,
        amount,
        round: game.table.currentRound,
        timestamp: FieldValue.serverTimestamp(),
      }),
    }, { merge: true });

    // Check if betting round is complete
    const activePlayers = Object.values(game.seats)
      .filter((seat) => seat && seat.status === 'active');

    const allMatched = activePlayers.every(
      (seat) => seat.currentBet === game.table.currentBet,
    );

    let nextTurn = getNextPlayer(game);

    // Advance to next round if betting complete
    if (allMatched || activePlayers.length <= 1) {
      game = await advanceRound(game, transaction, gameRef, handRef);
      nextTurn = game.table.currentTurn;
    } else {
      game.table.currentTurn = nextTurn;
    }

    // Update game state with timestamp
    const updateData = {
      ...game,
      table: {
        ...game.table,
        turnStartedAt: FieldValue.serverTimestamp(),
      },
    };

    transaction.update(gameRef, updateData);

    return {
      gameId,
      action,
      nextRound: game.table.currentRound,
      nextTurn,
    };
  });
}

/**
 * Advance to next betting round
 * @param {Object} game - Current game state
 * @param {Object} transaction - Firestore transaction
 * @param {Object} gameRef - Game document reference
 * @param {Object} handRef - Hand document reference
 * @return {Promise<Object>} Updated game state
 */
async function advanceRound(game, transaction, gameRef, handRef) {
  const { currentRound } = game.table;

  // Reset current bets for new round
  const seats = { ...game.seats };
  Object.keys(seats).forEach((seatNum) => {
    if (seats[seatNum]) {
      seats[seatNum].currentBet = 0;
    }
  });

  let updatedGame = { ...game, seats };

  switch (currentRound) {
  case 'preflop':
    updatedGame = dealFlop(updatedGame);
    break;
  case 'flop':
    updatedGame = dealTurnOrRiver(updatedGame, 'turn');
    break;
  case 'turn':
    updatedGame = dealTurnOrRiver(updatedGame, 'river');
    break;
  case 'river':
    // Showdown
    updatedGame = await handleShowdown(updatedGame, transaction, gameRef, handRef);
    break;
  }

  // Set next player to act
  if (updatedGame.table.currentRound !== 'showdown') {
    const activePlayers = Object.entries(updatedGame.seats)
      .filter(([, seat]) => seat && seat.status === 'active')
      .map(([num, seat]) => ({ seatNum: parseInt(num), odId: seat.odId }));

    if (activePlayers.length > 0) {
      updatedGame.table.currentTurn = activePlayers[0].odId;
    }
  }

  return updatedGame;
}

/**
 * Handle showdown and distribute winnings
 * @param {Object} game - Current game state
 * @param {Object} transaction - Firestore transaction
 * @param {Object} gameRef - Game document reference
 * @param {Object} handRef - Hand document reference
 * @return {Promise<Object>} Updated game state
 */
async function handleShowdown(game, transaction, gameRef, handRef) {
  // Get all hole cards
  const privateDocsSnapshot = await gameRef.collection('private').get();
  const holeCards = {};
  privateDocsSnapshot.forEach((doc) => {
    holeCards[doc.id] = doc.data().holeCards;
  });

  // Calculate winners
  const result = calculateWinners(game, holeCards);

  // Distribute pot among winners
  const seats = { ...game.seats };
  const amountPerWinner = Math.floor(result.pot / result.winners.length);
  const remainder = result.pot % result.winners.length;

  // Find winner closest to dealer for remainder
  let closestWinnerIndex = -1;
  let minDistance = Infinity;

  result.winners.forEach((winner, idx) => {
    const seatEntry = Object.entries(seats)
      .find(([, seat]) => seat && seat.odId === winner.playerId);
    if (seatEntry) {
      const [seatNum] = seatEntry;

      // 把總座位數先提出來，讓程式碼變短且更有效率 (不用算兩次)
      const totalSeats = Object.keys(seats).length;

      // 拆解計算公式，解決 max-len 問題
      // (目標座位 - 莊家座位 + 總數) % 總數 = 順時針距離
      const relativePos = parseInt(seatNum, 10) - game.table.dealerSeat;
      const distance = (relativePos + totalSeats) % totalSeats;

      if (distance < minDistance) {
        minDistance = distance;
        closestWinnerIndex = idx;
      }
    }
  });

  // Distribute chips
  result.winners.forEach((winner, idx) => {
    const seatEntry = Object.entries(seats)
      .find(([, seat]) => seat && seat.odId === winner.playerId);
    if (seatEntry) {
      const [seatNum] = seatEntry;
      let amount = amountPerWinner;
      // Give remainder to closest winner to dealer
      if (idx === closestWinnerIndex) {
        amount += remainder;
      }
      seats[seatNum].chips += amount;
    }
  });

  // Record result in hand history
  transaction.set(handRef, {
    communityCards: game.table.communityCards,
    result: {
      winners: result.winners.map((w, idx) => ({
        odId: w.playerId,
        amount: amountPerWinner + (idx === closestWinnerIndex ? remainder : 0),
        hand: w.hand.name,
      })),
      pot: result.pot,
    },
  }, { merge: true });

  // Clean up private hole cards after showdown
  privateDocsSnapshot.forEach((doc) => {
    transaction.delete(doc.ref);
  });

  // Check if game should end after this hand
  const shouldEndGame = game.meta?.pauseAfterHand === true;

  const finalStatus = shouldEndGame ? 'ended' : 'waiting';

  // If game is ending, settle it
  if (shouldEndGame) {
    // Settle will be called separately via settlePokerGame
  }

  return {
    ...game,
    seats,
    table: {
      ...game.table,
      currentRound: 'showdown',
      pot: 0,
      currentTurn: null,
    },
    status: finalStatus,
  };
}

/**
 * Set game to end after current hand
 * @param {string} gameId - Game ID
 * @return {Promise<void>}
 */
export async function setEndAfterHand(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  await gameRef.update({
    'meta.pauseAfterHand': true,
  });
}

/**
 * Settle and complete poker game
 * Saves chip changes to user history
 * @param {string} gameId - Game ID
 * @return {Promise<void>}
 */
export async function settlePokerGame(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();
    const seats = game.seats || {};

    // Get all seated players
    const seatedPlayers = Object.values(seats).filter((seat) => seat !== null);

    // For each player, calculate profit/loss and save to their history
    for (const player of seatedPlayers) {
      const userId = player.odId;
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);

      // Calculate profit/loss (current chips - initial buy-in)
      const initialBuyIn = player.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN;
      const profit = player.chips - initialBuyIn;

      const record = {
        date: new Date().toISOString(),
        createdAt: Date.now(),
        profit: profit,
        rate: 1, // Online poker uses chip values directly
        gameName: `Poker Game #${gameId.slice(0, 8)}`,
        gameType: 'online_poker',
        settlement: seatedPlayers.map((p) => ({
          name: p.odName,
          buyIn: p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN,
          stack: p.chips,
          profit: p.chips - (p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN),
        })),
      };

      if (userDoc.exists()) {
        transaction.update(userRef, {
          history: FieldValue.arrayUnion(record),
        });
      } else {
        transaction.set(userRef, {
          history: [record],
          createdAt: Date.now(),
        });
      }
    }

    // Mark game as completed
    transaction.update(gameRef, {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}
