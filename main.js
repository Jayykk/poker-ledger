import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { auth, db } from './firebase-init.js';
import { state, setView } from './store.js';
import * as Auth from './auth.js';
import * as Game from './game.js';
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './views.js';

const app = createApp({
    setup() {
        onAuthStateChanged(auth, (u) => {
            state.user = u;
            if (u) {
                loadUserData(u.uid);
                const savedId = localStorage.getItem('last_game_id');
                if (savedId) joinGameListener(savedId);
                if (state.view === 'LoginView') setView('LobbyView');
            } else {
                state.view = 'LoginView';
                state.game = null;
                state.history = [];
            }
        });

        const loadUserData = (uid) => {
            onSnapshot(doc(db, 'users', uid), (snap) => {
                if (snap.exists()) {
                    const d = snap.data();
                    let raw = d.history || [];
                    raw.sort((a, b) => new Date(a.date) - new Date(b.date));
                    state.history = raw.map(h => {
                        const dateObj = new Date(h.date);
                        const dateStr = dateObj.toLocaleString('zh-TW', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                        });
                        return { ...h, dateStr: dateStr };
                    });
                    const profit = raw.reduce((sum, h) => sum + (h.profit / (h.rate || 1)), 0);
                    const wins = raw.filter(h => h.profit > 0).length;
                    state.stats = { 
                        games: raw.length, 
                        totalProfit: profit, 
                        winRate: raw.length ? Math.round((wins/raw.length)*100) : 0 
                    };
                }
            });
        };

        let unsubGame = null;
        const joinGameListener = (id) => {
            if (unsubGame) unsubGame();
            unsubGame = onSnapshot(doc(db, 'games', id), (snap) => {
                if (snap.exists() && snap.data().status === 'active') {
                    state.game = { id: snap.id, ...snap.data() };
                    state.gameId = snap.id;
                    localStorage.setItem('last_game_id', id);
                    if(state.view !== 'GameView') setView('GameView');
                } else {
                    state.game = null;
                    state.gameId = null;
                    localStorage.removeItem('last_game_id');
                    if(state.view === 'GameView') {
                        alert("牌局已結束或被解散");
                        setView('LobbyView');
                    }
                }
            });
        };

        const handleCreate = async (name) => {
            const newId = await Game.createGame(name);
            if(newId) joinGameListener(newId);
        };

        // 1. 檢查房間
        const handleCheckGame = async (code, callback) => {
            const result = await Game.checkGameStatus(code);
            // 務必呼叫 callback 回傳給 views.js
            callback(result);
        };

        // 2. 綁定加入
        const handleBindJoin = async (code, pid) => {
            const success = await Game.joinByBinding(code, pid);
            if(success) joinGameListener(code);
        };

        // 3. 買入加入
        const handleNewJoin = async (code, buyIn) => {
            const success = await Game.joinAsNewPlayer(code, buyIn);
            if(success) joinGameListener(code);
        };

        // 4. 直接加入
        const handleJoinDirect = (code) => {
            joinGameListener(code);
        };

        const copyId = () => {
            navigator.clipboard.writeText(state.gameId);
            alert('已複製 ID');
        };

        const currentViewComponent = computed(() => {
            const views = { LoginView, LobbyView, GameView, ReportView, ProfileView };
            return views[state.view] || LoginView;
        });

        return { 
            state, setView, currentViewComponent,
            handleAuth: Auth.handleAuth,
            guestLogin: Auth.guestLogin,
            logout: Auth.logout,
            handleCreate, 
            
            // 加入邏輯的 Handler
            handleCheckGame, 
            handleBindJoin, 
            handleNewJoin, 
            handleJoin: handleJoinDirect,

            addPlayer: Game.addPlayer,
            savePlayer: Game.savePlayer,
            removePlayer: Game.removePlayer,
            addBuy: (p) => Game.savePlayer({ ...p, buyIn: p.buyIn + 2000 }),
            bindSeat: Game.bindSeat,
            settle: Game.settleGame,
            closeGame: Game.closeGame, // 解散房間
            goLobby: () => setView('LobbyView'),
            copyId
        };
    }
});

app.mount('#app');
