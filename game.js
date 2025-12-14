import { collection, doc, addDoc, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { state, setLoading, setView } from './store.js';

// 開新局
export const createGame = async (name) => {
    if (!state.user) return;
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
        // main.js 的監聽器會自動跳轉，這裡不用手動 setView
    } catch (e) {
        alert('開局失敗: ' + e.message);
    } finally {
        setLoading(false);
    }
};

// 加入玩家
export const addPlayer = async (name) => {
    if (!state.gameId) return;
    const newPlayer = { id: Date.now().toString(), name: name || '路人', uid: null, buyIn: 2000, stack: 0 };
    await updateDoc(doc(db, 'games', state.gameId), { players: arrayUnion(newPlayer) });
};

// 修改玩家資料 (買入/籌碼)
export const savePlayer = async (p) => {
    if (!state.gameId) return;
    const updatedPlayers = state.game.players.map(old => old.id === p.id ? p : old);
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

// 移除玩家
export const removePlayer = async (p) => {
    if(!confirm('移除?')) return;
    const updatedPlayers = state.game.players.filter(old => old.id !== p.id);
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

// 綁定座位
export const bindSeat = async (p) => {
    if(!confirm('綁定此座位?')) return;
    const updatedPlayers = state.game.players.map(old => 
        old.id === p.id ? { ...old, name: state.user.displayName || 'Guest', uid: state.user.uid } : old
    );
    await updateDoc(doc(db, 'games', state.gameId), { players: updatedPlayers });
};

// 結算
export const settleGame = async (rate) => {
    if (!confirm('確認結算並封存?')) return;
    setLoading(true);
    try {
        await runTransaction(db, async (t) => {
            const gameRef = doc(db, 'games', state.gameId);
            const gameDoc = await t.get(gameRef);
            if (!gameDoc.exists()) throw "Game error";
            
            const players = gameDoc.data().players;
            for (const p of players) {
                if (p.uid) {
                    const userRef = doc(db, 'users', p.uid);
                    const userDoc = await t.get(userRef);
                    const record = { 
                        date: new Date().toISOString(), 
                        profit: (p.stack || 0) - p.buyIn, 
                        rate: rate,
                        gameName: gameDoc.data().name
                    };
                    
                    if (userDoc.exists()) {
                        t.update(userRef, { history: arrayUnion(record) });
                    } else {
                        // 訪客如果第一次結算，可能沒有 user doc
                        t.set(userRef, { history: [record], createdAt: Date.now() });
                    }
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
