/**
 * Odds Calculator for Texas Hold'em Poker
 * Calculates outs and winning probabilities
 */

import { RANKS, SUITS } from './deck.js';
import { evaluateHand } from './handEvaluator.js';

/**
 * Calculate outs for current hand
 * Outs are cards that will improve the hand
 * @param {Array<string>} holeCards - Player's hole cards (e.g., ['As', 'Kh'])
 * @param {Array<string>} communityCards - Community cards on board
 * @param {Array<string>} deadCards - Cards known to be out (optional)
 * @return {Object} Outs information
 */
export function calculateOuts(holeCards, communityCards, deadCards = []) {
  if (!holeCards || holeCards.length !== 2) {
    throw new Error('Invalid hole cards');
  }
  if (!communityCards || communityCards.length < 3) {
    throw new Error('Need at least flop to calculate outs');
  }

  const allKnownCards = [...holeCards, ...communityCards, ...deadCards];
  const remainingDeck = getRemainingDeck(allKnownCards);
  const currentHand = evaluateHand([...holeCards, ...communityCards]);

  const outs = {
    total: 0,
    toFlush: 0,
    toStraight: 0,
    toPair: 0,
    toTwoPair: 0,
    toTrips: 0,
    toFullHouse: 0,
    toQuads: 0,
    cards: [],
  };

  // Count outs by simulating each remaining card
  remainingDeck.forEach((card) => {
    const newHand = [...holeCards, ...communityCards, card];
    const newEvaluation = evaluateHand(newHand);

    // Check if this card improves the hand
    if (newEvaluation.rank > currentHand.rank) {
      outs.total++;
      outs.cards.push(card);

      // Categorize the out
      categorizeOut(outs, currentHand.rank, newEvaluation.rank);
    }
  });

  return outs;
}

/**
 * Calculate win probability based on outs
 * Uses the rule of 2 and 4 for estimation
 * @param {number} outs - Number of outs
 * @param {string} round - Current round ('flop', 'turn')
 * @return {Object} Probability information
 */
export function calculateWinProbability(outs, round) {
  let probability = 0;

  if (round === 'flop') {
    // Two cards to come: multiply by 4 (approximate)
    probability = Math.min(outs * 4, 100);
  } else if (round === 'turn') {
    // One card to come: multiply by 2 (approximate)
    probability = Math.min(outs * 2, 100);
  }

  // More precise calculation using combinatorics
  const cardsRemaining = round === 'flop' ? 47 : 46;
  const cardsToSee = round === 'flop' ? 2 : 1;

  let exactProbability;
  if (cardsToSee === 1) {
    exactProbability = (outs / cardsRemaining) * 100;
  } else {
    // Probability of hitting on turn or river
    const missOnTurn = (cardsRemaining - outs) / cardsRemaining;
    const missOnRiver = (cardsRemaining - 1 - outs) / (cardsRemaining - 1);
    exactProbability = (1 - (missOnTurn * missOnRiver)) * 100;
  }

  return {
    outs,
    approximate: Math.round(probability),
    exact: Math.round(exactProbability * 10) / 10,
    odds: calculateOdds(outs, cardsRemaining),
  };
}

/**
 * Calculate odds in ratio format (e.g., "2:1")
 * @param {number} outs - Number of outs
 * @param {number} cardsRemaining - Cards remaining in deck
 * @return {string} Odds ratio
 */
function calculateOdds(outs, cardsRemaining) {
  const againstOuts = cardsRemaining - outs;
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(againstOuts, outs);
  return `${Math.round(againstOuts / divisor)}:${Math.round(outs / divisor)}`;
}

/**
 * Get remaining deck after removing known cards
 * @param {Array<string>} knownCards - Cards that are known
 * @return {Array<string>} Remaining cards in deck
 */
function getRemainingDeck(knownCards) {
  const fullDeck = [];
  RANKS.forEach((rank) => {
    SUITS.forEach((suit) => {
      fullDeck.push(`${rank}${suit}`);
    });
  });

  return fullDeck.filter((card) => !knownCards.includes(card));
}

/**
 * Categorize what type of hand the out makes
 * @param {Object} outs - Outs object to update
 * @param {number} currentRank - Current hand rank
 * @param {number} newRank - New hand rank after out
 */
function categorizeOut(outs, currentRank, newRank) {
  // Hand ranking values from handEvaluator
  const FLUSH = 5;
  const STRAIGHT = 4;
  const FULL_HOUSE = 6;
  const FOUR_OF_KIND = 7;
  const THREE_OF_KIND = 3;
  const TWO_PAIR = 2;
  const ONE_PAIR = 1;

  if (newRank === FLUSH) {
    outs.toFlush++;
  } else if (newRank === STRAIGHT) {
    outs.toStraight++;
  } else if (newRank === FULL_HOUSE) {
    outs.toFullHouse++;
  } else if (newRank === FOUR_OF_KIND) {
    outs.toQuads++;
  } else if (newRank === THREE_OF_KIND) {
    outs.toTrips++;
  } else if (newRank === TWO_PAIR) {
    outs.toTwoPair++;
  } else if (newRank === ONE_PAIR) {
    outs.toPair++;
  }
}

/**
 * Calculate equity against a range of hands (Monte Carlo simulation)
 * @param {Array<string>} holeCards - Player's hole cards
 * @param {Array<string>} communityCards - Current community cards
 * @param {number} simulations - Number of simulations to run
 * @return {Object} Equity information
 */
export function calculateEquity(holeCards, communityCards, simulations = 1000) {
  if (!holeCards || holeCards.length !== 2) {
    throw new Error('Invalid hole cards');
  }

  const knownCards = [...holeCards, ...communityCards];
  let wins = 0;
  let ties = 0;

  for (let i = 0; i < simulations; i++) {
    // Simulate opponent's random hole cards and complete board
    const remainingDeck = getRemainingDeck(knownCards);
    const shuffled = shuffleArray([...remainingDeck]);

    // Deal opponent cards
    const opponentCards = shuffled.slice(0, 2);

    // Complete the board
    const cardsNeeded = 5 - communityCards.length;
    const futureBoard = shuffled.slice(2, 2 + cardsNeeded);
    const finalBoard = [...communityCards, ...futureBoard];

    // Evaluate both hands
    const myHand = evaluateHand([...holeCards, ...finalBoard]);
    const oppHand = evaluateHand([...opponentCards, ...finalBoard]);

    if (myHand.rank > oppHand.rank) {
      wins++;
    } else if (myHand.rank === oppHand.rank) {
      // Need to compare kickers, for now count as tie
      ties++;
    }
  }

  const winRate = (wins / simulations) * 100;
  const tieRate = (ties / simulations) * 100;

  return {
    wins,
    ties,
    losses: simulations - wins - ties,
    simulations,
    winRate: Math.round(winRate * 10) / 10,
    tieRate: Math.round(tieRate * 10) / 10,
    equity: Math.round((winRate + tieRate / 2) * 10) / 10,
  };
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 * @param {Array} array - Array to shuffle
 * @return {Array} Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
