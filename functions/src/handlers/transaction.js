/**
 * Transaction handler for Cloud Functions
 * Records buy-ins with "who did it for whom" audit trail
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Record a buy-in (or add-on) transaction, or an action log entry.
 *
 * @param {object} params
 * @param {string} params.gameId
 * @param {string} params.targetUid - player receiving chips (may be null for unbound seats)
 * @param {string} params.targetName - display name of target
 * @param {number} params.amount
 * @param {string} params.type - 'buy_in' | 'add_on' | 'join' | 'modify' | 'remove' | 'bind'
 * @param {string} actionUid - caller's uid (from auth context)
 * @param {string} actionName - caller's display name
 * @return {{ txId: string, totalBuyIn: number }}
 */
export async function recordBuyIn({ gameId, targetUid, targetName, amount, type = 'buy_in' }, actionUid, actionName) {
  const db = getFirestore();
  
  // 1. 加回防呆驗證（保護資料庫不被塞入髒資料）
  if (!gameId) throw new Error('Missing gameId');
  if (!targetName) throw new Error('Missing targetName');
  
  // 2. 排除 NaN 炸彈：如果沒傳 amount 或無法轉成數字，強制轉為 0
  const safeAmount = Number(amount) || 0; 
  
  // 針對純金流操作，還是要阻擋負數或 0
  if (['buy_in', 'add_on'].includes(type) && safeAmount <= 0) {
    throw new Error('Amount must be positive for buy-ins and add-ons');
  }

  const txRef = db.collection('transactions').doc();
  const gameRef = db.collection('games').doc(gameId);

  await db.runTransaction(async (transaction) => {
    const gameSnap = await transaction.get(gameRef);
    const txData = {
      gameId, 
      targetUid: targetUid || null, 
      targetName, 
      actionUid, 
      actionName,
      amount: safeAmount, // 使用安全轉換後的數字
      type, 
      status: 'active', 
      undoneBy: null, 
      undoOf: null,
      timestamp: FieldValue.serverTimestamp(),
    };
    transaction.set(txRef, txData);

    if (gameSnap.exists) {
      const players = gameSnap.data().players || [];
      const updatedPlayers = players.map((p) => {
        const isTarget = targetUid ? p.uid === targetUid : p.name === targetName;
        // 使用 safeAmount 確保就算 type 是 join，加上的也是 0 而不是 NaN
        return isTarget ? { ...p, buyIn: (p.buyIn || 0) + safeAmount } : p;
      });
      transaction.update(gameRef, { players: updatedPlayers });
    }
  });

  const totalBuyIn = await getPlayerTotalBuyIn(gameId, targetUid, targetName);
  return { txId: txRef.id, totalBuyIn };
}

/**
 * Undo (cancel) a previous buy-in transaction.
 * Only the original actionUid or the game host can undo.
 *
 * @param {string} txId - transaction ID to undo
 * @param {string} callerUid - who is requesting the undo
 * @param {string} callerName - display name
 * @return {{ undoTxId: string }}
 */
export async function undoBuyIn(txId, callerUid, callerName) {
  const db = getFirestore();
  const txRef = db.collection('transactions').doc(txId);
  const undoRef = db.collection('transactions').doc();
  let gameRef;

  await db.runTransaction(async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists) throw new Error('Transaction not found');
    const tx = txSnap.data();
    if (tx.status !== 'active') throw new Error('Transaction already undone');

    gameRef = db.collection('games').doc(tx.gameId);
    const gameSnap = await transaction.get(gameRef);
    const isHost = gameSnap.exists && gameSnap.data().hostUid === callerUid;
    if (tx.actionUid !== callerUid && !isHost) throw new Error('Only the original operator or game host can undo');

    transaction.update(txRef, { status: 'undone', undoneBy: undoRef.id });
    transaction.set(undoRef, {
      ...tx, actionUid: callerUid, actionName: callerName, amount: -tx.amount,
      type: 'undo', status: 'active', undoneBy: null, undoOf: txId, timestamp: FieldValue.serverTimestamp(),
    });

    if (gameSnap.exists) {
      const players = gameSnap.data().players || [];
      const updatedPlayers = players.map((p) => {
        const isTarget = tx.targetUid ? p.uid === tx.targetUid : p.name === tx.targetName;
        return isTarget ? { ...p, buyIn: Math.max(0, (p.buyIn || 0) - tx.amount) } : p;
      });
      transaction.update(gameRef, { players: updatedPlayers });
    }
  });
  return { undoTxId: undoRef.id };
}

/**
 * Get transaction log for a game.
 *
 * @param {string} gameId
 * @return {Array} transactions sorted by timestamp desc
 */
export async function getTransactionLog(gameId) {
  const db = getFirestore();
  if (!gameId) throw new Error('Missing gameId');

  const snap = await db
    .collection('transactions')
    .where('gameId', '==', gameId)
    .orderBy('timestamp', 'desc')
    .get();

  return snap.docs.map((d) => ({ txId: d.id, ...d.data() }));
}

/**
 * Calculate total active buy-in for a player in a game.
 *
 * @param {string} gameId - game ID
 * @param {string} targetUid - player UID
 * @param {string} targetName - player display name
 * @return {Promise<number>} total buy-in amount
 */
async function getPlayerTotalBuyIn(gameId, targetUid, targetName) {
  const db = getFirestore();
  let q = db.collection('transactions').where('gameId', '==', gameId).where('status', '==', 'active');
  if (targetUid) q = q.where('targetUid', '==', targetUid);

  const snap = await q.get();
  let total = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!targetUid && data.targetName !== targetName) return;
    if (data.type === 'undo') return; // 👈 濾掉 undo 避免雙重扣款
    total += data.amount || 0;
  });
  return total;
}
