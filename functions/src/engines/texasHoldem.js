/**
 * Texas Hold'em Game Engine
 * Core game logic for managing poker hands
 */

import { createDeck, shuffleDeck, dealCards, burnCard } from '../utils/deck.js';
import { determineWinners } from '../utils/handEvaluator.js';

/**
 * Initialize a new hand
 * @param {Object} game - Current game state
 * @returns {Object} Updated game state with new hand setup
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
  const smallBlindSeat = activePlayers[(dealerIndex + 1) % activePlayers.length];
  const bigBlindSeat = activePlayers[(dealerIndex + 2) % activePlayers.length];

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
  table.currentTurn = activePlayers[firstToActIndex];

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
 * @returns {{ game: Object, holeCards: Object }} Updated game and hole cards
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
 * @returns {Object} Updated game state
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
 * @returns {Object} Updated game state
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
 * @returns {Object} Updated game state
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
 * @returns {string|null} Next player ID or null if round complete
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
 * @returns {Object} Winners and payout information
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
