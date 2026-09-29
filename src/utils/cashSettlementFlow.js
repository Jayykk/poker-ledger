export function buildCashSettlementReport(result) {
  return {
    gameId: result.gameId,
    gameName: result.gameName,
    rate: result.rate,
    cashDecimals: result.cashDecimals ?? null,
    players: result.settlement || [],
  };
}