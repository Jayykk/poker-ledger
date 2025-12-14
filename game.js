import { collection, doc, addDoc, updateDoc, deleteDoc, arrayUnion, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { state, setLoading, setView } from './store.js';

export const createGame = async (name) => {
    if (!state.user) return null;
    setLoading(true);
    try {
        const hostName = state.user.displayName || 'Guest';
        const docRef = await addDoc(collection(db, 'games'), {
            name: name,
            roomCode: Math.floor(1000 + Math.random() * 9000).toString(),
            hostUid: state.user.uid,
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
        alert('開局失敗: ' + e.message);
        return null;
    } finally {
        setLoading(false);
    }
};

// 🔥 新增：解散房間 (刪除)
export const closeGame = async () => {
    if (!state.gameId) return;
    if (!confirm('確定要「解散」房間嗎？\n此操作會直接刪除本局資料，無法復原。')) return;
    
    setLoading(true);
    try {
        await deleteDoc(doc(db, 'games', state.gameId));
        // 刪除後，main.js 的監聽器會自動偵測到檔案消失，並把大家踢回大廳
    } catch (e) {
        alert('解散失敗: ' + e.message);
    } finally {
        setLoading(false);
    }
};

export const checkGameStatus = async (gameId) => {
    setLoading(true);
    try {
        const docRef = doc(db, 'games', gameId);
        const snap = await getDoc(docRef);
        
        if (!snap.exists()) throw "找不到此局";
        if (snap.data().status !== 'active') throw "此局已結束";

        const players = snap.data().players || [];
        const amIIn = players.some(p => p.uid === state.user.uid);
        if (amIIn) return { status: 'joined' };

        const unbound = players.filter(p => !p.uid);
        return { status: 'open', unboundPlayers: unbound };

    } catch (e) {
        alert(e);
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
                    if (p.uid) throw "手慢了，該位置已被佔用";
                    return { ...p, uid: state.user.uid, name: state.user.displayName || 'Guest' };
                }
                return p;
            });
            t.update(gameRef, { players: newPlayers });
        });
        return true;
    } catch (e) {
        alert('綁定失敗: ' + e);
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
        alert('加入失敗: ' + e);
        return false;
    } finally {
        setLoading(false);
    }
};

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
    if(!confirm('移除?')) return;
    const updatedPlayers = state.game.players.filter(old => old.id !== p.id);
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

export const bindSeat = async (p) => {
    if(!confirm('綁定此座位?')) return;
    const updatedPlayers = state.game.players.map(old => 
        old.id === p.id ? { ...old, name: state.user.displayName || 'Guest', uid: state.user.uid } : old
    );
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

export const settleGame = async (rate) => {
    if (!confirm('確認結算並封存?')) return;
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
                        profit: (p.stack || 0) - p.buyIn, rate: rate, gameName: gameData.name 
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
        alert('結算失敗: ' + e.message);
    } finally {
        setLoading(false);
    }
};
