export function buildCashSettlementReport(result) {
  return {
    gameId: result.gameId,
    gameName: result.gameName,
    rate: result.rate,
    players: result.settlement || [],
  };
}