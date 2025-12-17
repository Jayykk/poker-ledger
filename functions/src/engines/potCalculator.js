/**
 * Pot Calculator
 * Calculates main pot and side pots for poker games
 */

/**
 * Calculate side pots for multiple all-in scenarios
 * @param {Object} game - Current game state
 * @return {Array<Object>} Array of pots with eligible players
 */
export function calculateSidePots(game) {
  const seats = Object.values(game.seats).filter((seat) => seat !== null);

  // Get all players who contributed to the pot
  const players = seats
    .map((seat, index) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: index,
      totalBet: seat.currentBet || 0,
      status: seat.status,
    }))
    .filter((p) => p.totalBet > 0)
    .sort((a, b) => a.totalBet - b.totalBet);

  if (players.length === 0) {
    return [];
  }

  const pots = [];
  let previousBet = 0;

  players.forEach((player, idx) => {
    const betLevel = player.totalBet;

    if (betLevel > previousBet) {
      // Create a new pot for this bet level
      const potAmount = (betLevel - previousBet) * (players.length - idx);
      const eligiblePlayers = players
        .slice(idx)
        .filter((p) => p.status !== 'folded')
        .map((p) => p.odId);

      if (eligiblePlayers.length > 0) {
        pots.push({
          amount: potAmount,
          eligiblePlayers,
          level: pots.length + 1,
          isMainPot: pots.length === 0,
        });
      }

      previousBet = betLevel;
    }
  });

  return pots;
}

/**
 * Distribute pot to winners
 * Handles main pot and side pots correctly
 * @param {Object} game - Current game state
 * @param {Array<Object>} winners - Array of winners with their hand info
 * @param {Object} holeCards - Map of player IDs to their hole cards
 * @return {Object} Updated seats with chip distributions
 */
export function distributePot(game, winners, holeCards) {
  const seats = { ...game.seats };
  const sidePots = calculateSidePots(game);

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
      pot.eligiblePlayers.includes(w.playerId),
    );

    if (eligibleWinners.length > 0) {
      const amountPerWinner = Math.floor(pot.amount / eligibleWinners.length);
      const remainder = pot.amount % eligibleWinners.length;
      const closestWinnerIndex = findClosestToDealer(game, eligibleWinners, seats);

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
