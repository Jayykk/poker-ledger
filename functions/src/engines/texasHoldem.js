/**
 * Texas Hold'em Game Engine
 * Core game logic for managing poker hands
 */

import { createDeck, shuffleDeck, dealCards, burnCard } from '../utils/deck.js';
import { determineWinners } from '../utils/handEvaluator.js';

/**
 * Initialize a new hand
 * @param {Object} game - Current game state
 * @return {Object} Updated game state with new hand setup
 */
export function initializeHand(game) {
  // Create and shuffle deck
  const deck = shuffleDeck(createDeck());

  // Reset table state
  const table = {
    ...game.table,
    pot: 0,
    sidePots: [],
    communityCards: [],
    currentRound: 'preflop',
    currentBet: 0,
    minRaise: game.meta.blinds.big,
    lastRaise: 0,
    deck,
  };

  // Reset all seats
  const seats = { ...game.seats };
  Object.keys(seats).forEach((seatNum) => {
    if (seats[seatNum]) {
      seats[seatNum] = {
        ...seats[seatNum],
        currentBet: 0,
        status: 'active',
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
      };
    }
  });

  // Rotate dealer button
  const activePlayers = Object.entries(seats)
    .filter(([, seat]) => seat && seat.chips > 0)
    .map(([num]) => parseInt(num));

  if (activePlayers.length < 2) {
    throw new Error('Not enough players to start hand');
  }

  // Find next dealer position
  let dealerSeat = (game.table.dealerSeat + 1) % game.meta.maxPlayers;
  while (!activePlayers.includes(dealerSeat)) {
    dealerSeat = (dealerSeat + 1) % game.meta.maxPlayers;
  }

  table.dealerSeat = dealerSeat;

  // Assign blinds
  const dealerIndex = activePlayers.indexOf(dealerSeat);
  
  // Special rule for heads-up (2 players): dealer is small blind
  let smallBlindSeat, bigBlindSeat;
  if (activePlayers.length === 2) {
    smallBlindSeat = dealerSeat; // Dealer is small blind in heads-up
    bigBlindSeat = activePlayers[(dealerIndex + 1) % activePlayers.length];
  } else {
    // Normal multi-way: small blind is next to dealer, big blind is after that
    smallBlindSeat = activePlayers[(dealerIndex + 1) % activePlayers.length];
    bigBlindSeat = activePlayers[(dealerIndex + 2) % activePlayers.length];
  }

  seats[dealerSeat].isDealer = true;
  seats[smallBlindSeat].isSmallBlind = true;
  seats[bigBlindSeat].isBigBlind = true;

  // Post blinds
  const smallBlind = Math.min(game.meta.blinds.small, seats[smallBlindSeat].chips);
  const bigBlind = Math.min(game.meta.blinds.big, seats[bigBlindSeat].chips);

  seats[smallBlindSeat].chips -= smallBlind;
  seats[smallBlindSeat].currentBet = smallBlind;
  seats[bigBlindSeat].chips -= bigBlind;
  seats[bigBlindSeat].currentBet = bigBlind;

  if (seats[smallBlindSeat].chips === 0) seats[smallBlindSeat].status = 'all_in';
  if (seats[bigBlindSeat].chips === 0) seats[bigBlindSeat].status = 'all_in';

  table.pot = smallBlind + bigBlind;
  table.currentBet = bigBlind;

  // First to act preflop
  // In heads-up, dealer (small blind) acts first preflop
  // In multi-way, player after big blind acts first
  const firstToActIndex = activePlayers.length === 2 ?
    dealerIndex :
    (dealerIndex + 3) % activePlayers.length;
  const firstToActSeat = activePlayers[firstToActIndex];
  table.currentTurn = seats[firstToActSeat].odId;

  return {
    ...game,
    table,
    seats,
    status: 'playing',
    handNumber: (game.handNumber || 0) + 1,
  };
}

/**
 * Deal hole cards to players
 * @param {Object} game - Current game state
 * @return {{ game: Object, holeCards: Object }} Updated game and hole cards
 */
export function dealHoleCards(game) {
  let { deck } = game.table;
  const holeCards = {};

  // Deal 2 cards to each active player
  Object.entries(game.seats).forEach(([seatNum, seat]) => {
    if (seat && seat.status !== 'sitting_out' && seat.chips >= 0) {
      const dealt = dealCards(deck, 2);
      holeCards[seat.odId] = dealt.cards;
      deck = dealt.remainingDeck;
    }
  });

  return {
    game: {
      ...game,
      table: { ...game.table, deck },
    },
    holeCards,
  };
}

/**
 * Deal flop (3 community cards)
 * @param {Object} game - Current game state
 * @return {Object} Updated game state
 */
export function dealFlop(game) {
  let { deck } = game.table;

  // Burn one card
  deck = burnCard(deck);

  // Deal 3 cards
  const dealt = dealCards(deck, 3);

  return {
    ...game,
    table: {
      ...game.table,
      communityCards: dealt.cards,
      deck: dealt.remainingDeck,
      currentRound: 'flop',
      currentBet: 0,
    },
  };
}

/**
 * Deal turn or river (1 community card)
 * @param {Object} game - Current game state
 * @param {string} round - 'turn' or 'river'
 * @return {Object} Updated game state
 */
export function dealTurnOrRiver(game, round) {
  let { deck } = game.table;

  // Burn one card
  deck = burnCard(deck);

  // Deal 1 card
  const dealt = dealCards(deck, 1);

  return {
    ...game,
    table: {
      ...game.table,
      communityCards: [...game.table.communityCards, ...dealt.cards],
      deck: dealt.remainingDeck,
      currentRound: round,
      currentBet: 0,
    },
  };
}

/**
 * Process player action
 * @param {Object} game - Current game state
 * @param {string} playerId - Player ID
 * @param {string} action - Action type
 * @param {number} amount - Bet amount
 * @return {Object} Updated game state
 */
export function processAction(game, playerId, action, amount = 0) {
  const seats = { ...game.seats };
  const playerSeat = Object.values(seats)
    .find((seat) => seat && seat.odId === playerId);

  if (!playerSeat) {
    throw new Error('Player not found');
  }

  const seatNum = Object.keys(seats)
    .find((num) => seats[num]?.odId === playerId);

  const table = { ...game.table };

  switch (action) {
  case 'fold':
    seats[seatNum].status = 'folded';
    break;

  case 'check':
    // No chips change
    break;

  case 'call': {
    const callAmount = Math.min(
      table.currentBet - playerSeat.currentBet,
      playerSeat.chips,
    );
    seats[seatNum].chips -= callAmount;
    seats[seatNum].currentBet += callAmount;
    table.pot += callAmount;
    if (seats[seatNum].chips === 0) {
      seats[seatNum].status = 'all_in';
    }
    break;
  }

  case 'raise': {
    const raiseAmount = Math.min(amount, playerSeat.chips);
    seats[seatNum].chips -= raiseAmount;
    seats[seatNum].currentBet += raiseAmount;
    table.pot += raiseAmount;
    table.currentBet = seats[seatNum].currentBet;
    table.minRaise = raiseAmount;
    if (seats[seatNum].chips === 0) {
      seats[seatNum].status = 'all_in';
    }
    break;
  }

  case 'all_in': {
    const allInAmount = playerSeat.chips;
    seats[seatNum].chips = 0;
    seats[seatNum].currentBet += allInAmount;
    table.pot += allInAmount;
    seats[seatNum].status = 'all_in';
    if (seats[seatNum].currentBet > table.currentBet) {
      table.currentBet = seats[seatNum].currentBet;
    }
    break;
  }
  }

  return { ...game, table, seats };
}

/**
 * Determine next player to act
 * @param {Object} game - Current game state
 * @return {string|null} Next player ID or null if round complete
 */
export function getNextPlayer(game) {
  const activePlayers = Object.entries(game.seats)
    .filter(([, seat]) => seat && seat.status === 'active' && seat.chips > 0)
    .map(([num, seat]) => ({ seatNum: parseInt(num), odId: seat.odId }));

  if (activePlayers.length === 0) return null;

  const currentSeatNum = Object.entries(game.seats)
    .find(([, seat]) => seat?.odId === game.table.currentTurn)?.[0];

  const currentIndex = activePlayers
    .findIndex((p) => p.seatNum === parseInt(currentSeatNum));
  const nextIndex = (currentIndex + 1) % activePlayers.length;

  return activePlayers[nextIndex].odId;
}

/**
 * Determine hand winners and calculate payouts
 * @param {Object} game - Current game state
 * @param {Object} holeCards - Map of player IDs to hole cards
 * @return {Object} Winners and payout information
 */
export function calculateWinners(game, holeCards) {
  const activePlayers = Object.values(game.seats)
    .filter((seat) => seat && seat.status !== 'folded')
    .map((seat) => ({
      playerId: seat.odId,
      cards: holeCards[seat.odId] || [],
    }));

  if (activePlayers.length === 0) {
    return { winners: [], pot: 0 };
  }

  if (activePlayers.length === 1) {
    // Only one player left, they win by default
    return {
      winners: [{
        playerId: activePlayers[0].playerId,
        hand: { name: 'Win by fold' },
      }],
      pot: game.table.pot,
    };
  }

  // Showdown - evaluate hands
  const winners = determineWinners(activePlayers, game.table.communityCards);

  return {
    winners,
    pot: game.table.pot,
  };
}

/**
 * Calculate side pots for multiple all-in scenarios
 * @param {Object} game - Current game state
 * @return {Array<Object>} Array of side pots with eligible players
 */
export function calculateSidePots(game) {
  const seats = Object.values(game.seats).filter((seat) => seat !== null);

  // Get all players who contributed to the pot
  const players = seats
    .map((seat, index) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: index,
      totalBet: seat.currentBet,
      status: seat.status,
    }))
    .filter((p) => p.totalBet > 0)
    .sort((a, b) => a.totalBet - b.totalBet);

  if (players.length === 0) {
    return [];
  }

  const sidePots = [];
  let previousBet = 0;

  players.forEach((player, idx) => {
    const betLevel = player.totalBet;

    if (betLevel > previousBet) {
      // Create a new side pot for this bet level
      const potAmount = (betLevel - previousBet) * (players.length - idx);
      const eligiblePlayers = players
        .slice(idx)
        .filter((p) => p.status !== 'folded')
        .map((p) => p.odId);

      if (eligiblePlayers.length > 0) {
        sidePots.push({
          amount: potAmount,
          eligiblePlayers,
          level: sidePots.length + 1,
        });
      }

      previousBet = betLevel;
    }
  });

  return sidePots;
}

/**
 * Run It Twice - Deal board twice for all-in situations
 * @param {Object} game - Current game state
 * @param {Array<string>} players - Player IDs who agreed to run it twice
 * @return {Object} Result with two board runouts
 */
export function runItTwice(game, players) {
  if (players.length !== 2) {
    throw new Error('Run it twice requires exactly 2 players');
  }

  // Verify both players are all-in
  const allInPlayers = Object.values(game.seats)
    .filter((seat) => seat && seat.status === 'all_in' && players.includes(seat.odId));

  if (allInPlayers.length !== 2) {
    throw new Error('Both players must be all-in');
  }

  const currentBoard = game.table.communityCards;
  const cardsNeeded = 5 - currentBoard.length;

  if (cardsNeeded === 0) {
    throw new Error('Board already complete');
  }

  let deck1 = [...game.table.deck];
  let deck2 = [...game.table.deck];

  // First runout
  const runout1 = [...currentBoard];
  for (let i = 0; i < cardsNeeded; i++) {
    deck1 = burnCard(deck1);
    const dealt = dealCards(deck1, 1);
    runout1.push(...dealt.cards);
    deck1 = dealt.remainingDeck;
  }

  // Second runout (from same starting deck)
  const runout2 = [...currentBoard];
  for (let i = 0; i < cardsNeeded; i++) {
    deck2 = burnCard(deck2);
    const dealt = dealCards(deck2, 1);
    runout2.push(...dealt.cards);
    deck2 = dealt.remainingDeck;
  }

  return {
    runout1,
    runout2,
    originalPot: game.table.pot,
  };
}
