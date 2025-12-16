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
import { addGameEvent } from '../lib/events.js';

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

    // Update game state with turnStartedAt merged into table
    const gameToUpdate = {
      ...updatedGame,
      table: {
        ...updatedGame.table,
        turnStartedAt: FieldValue.serverTimestamp(),
      },
    };
    transaction.update(gameRef, gameToUpdate);

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

    // Record action in events subcollection
    // Note: Changed from arrayUnion to subcollection documents because
    // FieldValue.serverTimestamp() cannot be used inside array elements
    await addGameEvent(
      gameId,
      {
        type: 'action',
        handNumber: game.handNumber,
        odId: userId,
        action,
        amount,
        round: game.table.currentRound,
      },
      transaction,
    );

    // Check if betting round is complete
    const activePlayers = Object.values(game.seats)
      .filter((seat) => seat && seat.status === 'active');

    const allMatched = activePlayers.every(
      (seat) => seat.currentBet === game.table.currentBet,
    );

    let nextTurn = getNextPlayer(game);

    // Advance to next round if betting complete
    if (allMatched || activePlayers.length <= 1) {
      game = await advanceRound(game, transaction, gameRef);
      nextTurn = game.table.currentTurn;
    } else {
      game.table.currentTurn = nextTurn;
    }

    // Update game state with turnStartedAt merged into table
    const gameToUpdate = {
      ...game,
      table: {
        ...game.table,
        turnStartedAt: FieldValue.serverTimestamp(),
      },
    };
    transaction.update(gameRef, gameToUpdate);

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
 * @return {Promise<Object>} Updated game state
 */
async function advanceRound(game, transaction, gameRef) {
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
    updatedGame = await handleShowdown(updatedGame, transaction, gameRef);
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
 * @return {Promise<Object>} Updated game state
 */
async function handleShowdown(game, transaction, gameRef) {
  // Get all hole cards - list documents and get them individually in transaction
  // Note: listDocuments() gets references only (not data), which is safe.
  // The actual data read happens with transaction.get() inside the transaction.
  const privateCollection = gameRef.collection('private');
  const privateDocs = await privateCollection.listDocuments();
  const holeCards = {};

  // Get each document within the transaction
  for (const docRef of privateDocs) {
    const docSnap = await transaction.get(docRef);
    if (docSnap.exists) {
      holeCards[docSnap.id] = docSnap.data().holeCards;
    }
  }

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
  const bigBlind = game.meta?.blinds?.big || 20;
  const potInBB = result.pot / bigBlind;

  // Check if this is a notable hand
  const hasHighRank = result.winners.some((w) => w.hand.rank >= 6); // Full House or better
  const hasLargePot = potInBB >= 50; // Pot >= 50BB
  const hadAllIn = Object.values(game.seats)
    .some((seat) => seat && seat.status === 'all_in');

  const isNotable = hasHighRank || hasLargePot || hadAllIn;

  const handData = {
    communityCards: game.table.communityCards,
    result: {
      winners: result.winners.map((w, idx) => ({
        odId: w.playerId,
        amount: amountPerWinner + (idx === closestWinnerIndex ? remainder : 0),
        hand: w.hand.name,
        handRank: w.hand.rank,
      })),
      pot: result.pot,
      potInBB,
    },
    notable: isNotable,
    notableReasons: {
      highRank: hasHighRank,
      largePot: hasLargePot,
      allIn: hadAllIn,
    },
  };

  // Save hole cards if notable hand or cards were shown
  if (isNotable) {
    handData.playerCards = {};
    Object.entries(holeCards).forEach(([playerId, cards]) => {
      handData.playerCards[playerId] = cards;
    });
  }

  // Save hand history to hands subcollection
  const handRef = gameRef.collection('hands').doc(`hand_${game.handNumber}`);
  transaction.set(handRef, handData, { merge: true });

  // Clean up private hole cards after showdown
  for (const docRef of privateDocs) {
    transaction.delete(docRef);
  }

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

/**
 * Show cards voluntarily (before or after showdown)
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<void>}
 */
export async function showCards(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Verify user is in the game
    const playerSeat = Object.entries(game.seats).find(
      ([, seat]) => seat && seat.odId === userId,
    );

    if (!playerSeat) {
      throw new Error('Player not in game');
    }

    // Get player's hole cards from private collection
    const privateRef = gameRef.collection('private').doc(userId);
    const privateDoc = await transaction.get(privateRef);

    if (!privateDoc.exists) {
      throw new Error('No cards to show');
    }

    const holeCards = privateDoc.data().holeCards;

    // Record shown cards in events subcollection
    // Note: Changed from arrayUnion to subcollection documents because
    // FieldValue.serverTimestamp() cannot be used inside array elements
    await addGameEvent(
      gameId,
      {
        type: 'shownCards',
        handNumber: game.handNumber,
        odId: userId,
        cards: holeCards,
      },
      transaction,
    );

    return {
      gameId,
      userId,
      cards: holeCards,
    };
  });
}

/**
 * Handle player timeout
 * Auto-fold if there's a bet to call, otherwise check
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<Object>} Result of timeout action
 */
export async function handlePlayerTimeout(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Verify it's the player's turn
    if (game.table.currentTurn !== userId) {
      throw new Error('Not player\'s turn');
    }

    // Find player seat
    const playerSeat = Object.entries(game.seats).find(
      ([, seat]) => seat && seat.odId === userId,
    );

    if (!playerSeat) {
      throw new Error('Player not in game');
    }

    const [seatNum, seat] = playerSeat;

    // Determine action: fold if bet to call, otherwise check
    const hasBetToCall = seat.currentBet < game.table.currentBet;
    const action = hasBetToCall ? 'fold' : 'check';

    // Mark player as timed out
    const seats = { ...game.seats };
    seats[seatNum] = {
      ...seat,
      timedOut: true,
      lastTimeout: FieldValue.serverTimestamp(),
    };

    // Update game with timeout marker
    transaction.update(gameRef, { seats });

    // Process the automatic action through the normal flow
    // This ensures all game logic is consistently applied
    return {
      gameId,
      userId,
      action,
      automatic: true,
    };
  });
}
