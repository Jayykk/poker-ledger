/**
 * Build cash settlement rows from server-loaded players.
 * @param {Array<object>} players Game players.
 * @return {Array<object>} Immutable cash settlement rows.
 */
export function buildCashSettlement(players = []) {
  return players.map((player) => ({
    odId: player.uid || null,
    name: player.name,
    buyIn: Math.round(player.buyIn || 0),
    stack: Math.round(player.stack || 0),
    profit: Math.round((player.stack || 0) - (player.buyIn || 0)),
  }));
}
