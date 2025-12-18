/**
 * Pot Calculator
 * Calculates main pot and side pots for poker games
 */

import pokersolver from 'pokersolver';
const { Hand } = pokersolver;

/**
 * Calculate side pots for multiple all-in scenarios
 * CRITICAL FIX: Includes dead money from folded players in main pot
 * @param {Array} players - Array of player objects with totalBet and status
 * @return {Array<Object>} Array of pots with eligible players
 */
export function calculateSidePots(players) {
  // 1. Calculate dead money from folded players
  let deadMoney = 0;
  players.forEach((p) => {
    if (p.status === 'folded') {
      deadMoney += (p.totalBet || 0);
    }
  });

  // 2. Process only active (non-folded) players for pot distribution
  const activePlayers = [...players]
    .filter((p) => p.status !== 'folded' && (p.totalBet || 0) > 0)
    .sort((a, b) => (a.totalBet || 0) - (b.totalBet || 0));

  // Special case: if no active players, return empty
  if (activePlayers.length === 0) {
    return [];
  }

  const pots = [];
  let previousBet = 0;

  for (let i = 0; i < activePlayers.length; i++) {
    const currentBet = activePlayers[i].totalBet || 0;
    const betDiff = currentBet - previousBet;

    if (betDiff > 0) {
      // Contributors at this level
      const contributors = activePlayers.slice(i);

      // Calculate pot amount for this level
      let potAmount = betDiff * contributors.length;

      // 🔥 CRITICAL: Add dead money to Main Pot (first pot only)
      if (pots.length === 0) {
        potAmount += deadMoney;
      }

      pots.push({
        amount: potAmount,
        eligiblePlayerIds: contributors.map((p) => p.odId),
        level: pots.length + 1,
        isMainPot: pots.length === 0,
      });
    }

    previousBet = currentBet;
  }

  return pots;
}

/**
 * Distribute pots to winners using pokersolver
 * @param {Array} pots - Array of pot objects from calculateSidePots
 * @param {Object} showdownResults - Results from determineWinners
 * @param {Array} players - Array of all active players
 * @return {Object} Map of odId to winnings amount
 */
export function distributePots(pots, showdownResults, players) {
  const winnings = {}; // { odId: amount }

  for (const pot of pots) {
    // Find eligible results for this pot
    const eligibleResults = showdownResults.results.filter((r) =>
      pot.eligiblePlayerIds.includes(r.odId),
    );

    if (eligibleResults.length === 0) continue;

    // Find winners among eligible players
    const hands = eligibleResults.map((r) => r.hand);
    const winningHands = Hand.winners(hands);

    const potWinners = eligibleResults.filter((r) =>
      winningHands.some((w) => w === r.hand),
    );

    // Divide pot among winners
    const share = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount % potWinners.length;

    potWinners.forEach((winner, index) => {
      winnings[winner.odId] = (winnings[winner.odId] || 0) + share;
      // Give remainder to first winner (in future could use dealer proximity)
      if (index === 0) {
        winnings[winner.odId] += remainder;
      }
    });
  }

  return winnings;
}

/**
 * Calculate side pots from game state (backward compatibility)
 * @param {Object} game - Current game state
 * @return {Array<Object>} Array of pots with eligible players
 */
export function calculateSidePotsFromGame(game) {
  // Get ALL players who contributed to the pot (including folded players for dead money)
  const players = Object.entries(game.seats)
    .filter(([, seat]) => seat !== null && (seat.totalBet || 0) > 0)
    .map(([seatNum, seat]) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: parseInt(seatNum, 10),
      totalBet: seat.totalBet || 0,
      status: seat.status,
    }));

  return calculateSidePots(players);
}

/**
 * Distribute pot to winners (legacy function for backward compatibility)
 * Handles main pot and side pots correctly
 * @param {Object} game - Current game state
 * @param {Array<Object>} winners - Array of winners with their hand info
 * @param {Object} holeCards - Map of player IDs to their hole cards
 * @return {Object} Updated seats with chip distributions
 */
export function distributePot(game, winners, holeCards) {
  const seats = { ...game.seats };
  const sidePots = calculateSidePotsFromGame(game);

  // If no side pots, distribute main pot equally
  if (sidePots.length === 0) {
    const totalPot = game.table.pot;
    const amountPerWinner = Math.floor(totalPot / winners.length);
    const remainder = totalPot % winners.length;

    // Find winner closest to dealer for remainder
    const closestWinnerIndex = findClosestToDealer(game, winners, seats);

    winners.forEach((winner, idx) => {
      const seatEntry = Object.entries(seats)
        .find(([, seat]) => seat && seat.odId === winner.playerId);
      if (seatEntry) {
        const [seatNum] = seatEntry;
        let amount = amountPerWinner;
        if (idx === closestWinnerIndex) {
          amount += remainder;
        }
        seats[seatNum].chips += amount;
      }
    });

    return seats;
  }

  // Distribute each side pot to eligible winners
  sidePots.forEach((pot) => {
    const eligibleWinners = winners.filter((w) =>
      pot.eligiblePlayerIds.includes(w.playerId),
    );

    if (eligibleWinners.length > 0) {
      const amountPerWinner = Math.floor(pot.amount / eligibleWinners.length);
      const remainder = pot.amount % eligibleWinners.length;
      const closestWinnerIndex = findClosestToDealer(
        game,
        eligibleWinners,
        seats,
      );

      eligibleWinners.forEach((winner, idx) => {
        const seatEntry = Object.entries(seats)
          .find(([, seat]) => seat && seat.odId === winner.playerId);
        if (seatEntry) {
          const [seatNum] = seatEntry;
          let amount = amountPerWinner;
          if (idx === closestWinnerIndex) {
            amount += remainder;
          }
          seats[seatNum].chips += amount;
        }
      });
    }
  });

  return seats;
}

/**
 * Find winner closest to dealer button (for odd chip distribution)
 * @param {Object} game - Game state
 * @param {Array<Object>} winners - Array of winners
 * @param {Object} seats - Seat data
 * @return {number} Index of closest winner
 */
function findClosestToDealer(game, winners, seats) {
  let closestWinnerIndex = -1;
  let minDistance = Infinity;

  winners.forEach((winner, idx) => {
    const seatEntry = Object.entries(seats)
      .find(([, seat]) => seat && seat.odId === winner.playerId);
    if (seatEntry) {
      const [seatNum] = seatEntry;
      const totalSeats = Object.keys(seats).length;
      const relativePos = parseInt(seatNum, 10) - game.table.dealerSeat;
      const distance = (relativePos + totalSeats) % totalSeats;

      if (distance < minDistance) {
        minDistance = distance;
        closestWinnerIndex = idx;
      }
    }
  });

  return closestWinnerIndex;
}
