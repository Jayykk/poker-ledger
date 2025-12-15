import { collection, doc, addDoc, updateDoc, deleteDoc, arrayUnion, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { state, setLoading, setView } from './store.js';

// Helper function to show notifications (non-blocking)
const showNotification = (message, type = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    window.dispatchEvent(new CustomEvent('show-notification', { 
        detail: { message, type } 
    }));
};

// Helper function to show confirmation (uses a simpler approach for legacy code)
const showConfirm = (message) => {
    // For legacy compatibility, still using confirm but with a note
    // In a full migration, this would use a custom modal
    return confirm(message);
};

export const createGame = async (name) => {
    if (!state.user) return null;
    setLoading(true);
    try {
        const hostName = state.user.displayName || 'Guest';
        const docRef = await addDoc(collection(db, 'games'), {
            name: name,
            roomCode: Math.floor(1000 + Math.random() * 9000).toString(),
            hostUid: state.user.uid,
            hostName: hostName,
            status: 'active',
            createdAt: Date.now(),
            players: [{ 
                id: Date.now().toString(), 
                name: hostName, 
                uid: state.user.uid, 
                buyIn: 2000, 
                stack: 0 
            }]
        });
        return docRef.id;
    } catch (e) {
        showNotification('開局失敗: ' + e.message, 'error');
        return null;
    } finally {
        setLoading(false);
    }
};

export const closeGame = async () => {
    if (!state.gameId) return;
    // Check if current user is the host
    if (state.game.hostUid !== state.user.uid) {
        showNotification('只有房主才能解散房間', 'error');
        return;
    }
    if (!showConfirm('確定要「解散」房間嗎？資料將直接刪除。')) return;
    setLoading(true);
    try {
        console.log("【Game】執行刪除 Doc:", state.gameId); // LOG 7
        await deleteDoc(doc(db, 'games', state.gameId));
        console.log("【Game】刪除成功"); // LOG 8
    } catch (e) {
        console.error("【Game】刪除失敗:", e);
        showNotification('解散失敗: ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
};

export const checkGameStatus = async (gameId) => {
    console.log("【Game】開始檢查 ID:", gameId); // LOG 9
    setLoading(true);
    try {
        const docRef = doc(db, 'games', gameId);
        const snap = await getDoc(docRef);
        
        if (!snap.exists()) {
            console.log("【Game】找不到局");
            throw "找不到此局";
        }
        if (snap.data().status !== 'active') {
            console.log("【Game】局已結束");
            throw "此局已結束";
        }

        const players = snap.data().players || [];
        const amIIn = players.some(p => p.uid === state.user.uid);
        if (amIIn) return { status: 'joined' };

        const unbound = players.filter(p => !p.uid);
        console.log("【Game】檢查完成，空位:", unbound);
        return { status: 'open', unboundPlayers: unbound };

    } catch (e) {
        console.error("【Game】檢查報錯:", e);
        return { status: 'error', msg: e };
    } finally {
        setLoading(false);
    }
};

export const joinByBinding = async (gameId, playerId) => {
    setLoading(true);
    try {
        await runTransaction(db, async (t) => {
            const gameRef = doc(db, 'games', gameId);
            const gameDoc = await t.get(gameRef);
            const players = gameDoc.data().players;
            
            const newPlayers = players.map(p => {
                if (p.id === playerId) {
                    if (p.uid) throw "位置已被佔用";
                    return { ...p, uid: state.user.uid, name: state.user.displayName || 'Guest' };
                }
                return p;
            });
            t.update(gameRef, { players: newPlayers });
        });
        return true;
    } catch (e) {
        showNotification('綁定失敗: ' + e, 'error');
        return false;
    } finally {
        setLoading(false);
    }
};

export const joinAsNewPlayer = async (gameId, buyIn) => {
    setLoading(true);
    try {
        await runTransaction(db, async (t) => {
            const gameRef = doc(db, 'games', gameId);
            const gameDoc = await t.get(gameRef);
            const players = gameDoc.data().players;

            if (players.some(p => p.uid === state.user.uid)) return;

            let baseName = state.user.displayName || 'Guest';
            let finalName = baseName;
            let counter = 2;
            const existingNames = players.map(p => p.name);
            while (existingNames.includes(finalName)) {
                finalName = `${baseName} (${counter})`;
                counter++;
            }

            const newPlayer = { 
                id: Date.now().toString(), 
                name: finalName, 
                uid: state.user.uid, 
                buyIn: parseInt(buyIn), 
                stack: 0 
            };
            t.update(gameRef, { players: arrayUnion(newPlayer) });
        });
        return true;
    } catch (e) {
        showNotification('加入失敗: ' + e, 'error');
        return false;
    } finally {
        setLoading(false);
    }
};

// ... 其他 addPlayer, savePlayer, removePlayer, bindSeat, settleGame 保持不變 (請複製前面的內容) ...
export const addPlayer = async (name) => {
    if (!state.gameId) return;
    const newPlayer = { id: Date.now().toString(), name: name || '路人', uid: null, buyIn: 2000, stack: 0 };
    await updateDoc(doc(db, 'games', state.gameId), { players: arrayUnion(newPlayer) });
};

export const savePlayer = async (p) => {
    if (!state.gameId) return;
    const updatedPlayers = state.game.players.map(old => old.id === p.id ? p : old);
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

export const removePlayer = async (p) => {
    if(!showConfirm('移除?')) return;
    const updatedPlayers = state.game.players.filter(old => old.id !== p.id);
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

export const bindSeat = async (p) => {
    if(!showConfirm('綁定此座位?')) return;
    const updatedPlayers = state.game.players.map(old => 
        old.id === p.id ? { ...old, name: state.user.displayName || 'Guest', uid: state.user.uid } : old
    );
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

export const settleGame = async (rate) => {
    if (!showConfirm('確認結算並封存?')) return;
    setLoading(true);
    try {
        await runTransaction(db, async (t) => {
            const gameRef = doc(db, 'games', state.gameId);
            const gameDoc = await t.get(gameRef);
            if (!gameDoc.exists()) throw "Game error";
            const gameData = gameDoc.data();
            const players = gameData.players;
            for (const p of players) {
                if (p.uid) {
                    const userRef = doc(db, 'users', p.uid);
                    const userDoc = await t.get(userRef);
                    const record = { 
                        date: new Date().toISOString(), createdAt: Date.now(),
                        profit: (p.stack || 0) - p.buyIn, rate: rate, gameName: gameData.name,
                        // Save complete settlement data
                        settlement: players.map(player => ({
                            name: player.name,
                            buyIn: player.buyIn,
                            stack: player.stack || 0,
                            profit: (player.stack || 0) - player.buyIn
                        }))
                    };
                    if (userDoc.exists()) t.update(userRef, { history: arrayUnion(record) });
                    else t.set(userRef, { history: [record], createdAt: Date.now() });
                }
            }
            t.update(gameRef, { status: 'completed' });
        });
        setView('ReportView');
        state.game = null;
    } catch (e) {
        showNotification('結算失敗: ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
};
