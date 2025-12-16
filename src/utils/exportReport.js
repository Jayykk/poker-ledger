// Export utilities for reports

import { formatDate, formatCash, calculateNet, formatNumber } from './formatters.js';

/**
 * Calculate minimum cash flow transfers
 * Uses greedy algorithm to minimize number of transactions
 * @param {Array} players - Array of player objects
 * @returns {Array} Array of transfer objects {from, to, amount}
 */
const calculateMinimumTransfers = (players) => {
  // Calculate net balance for each player
  const balances = players.map(p => ({
    name: p.name,
    balance: calculateNet(p)
  })).filter(b => b.balance !== 0); // Only include players with non-zero balance

  const transfers = [];
  
  // Create copies for manipulation
  const creditors = balances.filter(b => b.balance > 0).map(b => ({ ...b })); // People who should receive
  const debtors = balances.filter(b => b.balance < 0).map(b => ({ ...b, balance: -b.balance })); // People who should pay (positive amount)
  
  // Greedy algorithm: match largest debtor with largest creditor
  while (creditors.length > 0 && debtors.length > 0) {
    // Sort by balance (descending)
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);
    
    const creditor = creditors[0];
    const debtor = debtors[0];
    
    // Transfer amount is minimum of what debtor owes and what creditor is owed
    const transferAmount = Math.min(debtor.balance, creditor.balance);
    
    transfers.push({
      from: debtor.name,
      to: creditor.name,
      amount: transferAmount
    });
    
    // Update balances
    creditor.balance -= transferAmount;
    debtor.balance -= transferAmount;
    
    // Remove if settled
    if (creditor.balance === 0) {
      creditors.shift();
    }
    if (debtor.balance === 0) {
      debtors.shift();
    }
  }
  
  return transfers;
};

/**
 * Generate text report for a game
 * @param {Object} game - Game object
 * @param {number} rate - Exchange rate
 * @returns {string} Text report
 */
export const generateTextReport = (game, rate = 10) => {
  if (!game) return '';
  
  const gap = game.players.reduce((sum, p) => sum + (p.stack || 0), 0) - 
              game.players.reduce((sum, p) => sum + p.buyIn, 0);
  
  let text = `🎲 局: ${game.name}\n`;
  text += `📅 ${formatDate(new Date())}\n`;
  text += `💰 匯率: 1:${rate}\n`;
  text += `---\n`;
  
  const sortedPlayers = [...game.players].sort((a, b) => calculateNet(b) - calculateNet(a));
  sortedPlayers.forEach(p => {
    const net = calculateNet(p);
    text += `${p.name}: ${net > 0 ? '+' : ''}${formatCash(net, rate)}\n`;
  });
  
  if (gap !== 0) {
    text += `---\n⚠️ 誤差: ${formatNumber(gap)}\n`;
  }
  
  // Add minimum transfer suggestions
  const transfers = calculateMinimumTransfers(game.players);
  if (transfers.length > 0) {
    text += `---\n=== 轉帳建議 ===\n`;
    transfers.forEach(t => {
      text += `${t.from} → ${t.to}: ${formatCash(t.amount, rate)}\n`;
    });
  }
  
  return text;
};

/**
 * Generate CSV data for history export
 * @param {Array} history - History array
 * @returns {string} CSV data
 */
export const generateCSV = (history) => {
  if (!history || history.length === 0) return '';
  
  let csv = '日期,牌局名稱,損益(籌碼),匯率,損益(現金)\n';
  
  history.forEach(record => {
    const date = formatDate(record.date);
    const name = (record.gameName || '未命名').replace(/,/g, '');
    const profit = record.profit || 0;
    const rate = record.rate || 1;
    const cash = formatCash(profit, rate);
    
    csv += `${date},${name},${profit},${rate},${cash}\n`;
  });
  
  return csv;
};

/**
 * Download CSV file
 * @param {string} csvData - CSV data string
 * @param {string} filename - Filename for download
 */
export const downloadCSV = (csvData, filename = 'poker-report.csv') => {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export history to CSV
 * @param {Array} history - History array
 * @param {string} filename - Filename for download
 */
export const exportHistoryToCSV = (history, filename) => {
  const csvData = generateCSV(history);
  downloadCSV(csvData, filename);
};
