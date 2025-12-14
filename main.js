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
        // --- Auth 監聽 ---
        onAuthStateChanged(auth, (u) => {
            state.user = u;
            if (u) {
                // 登入後載入資料
                loadUserData(u.uid);
                // 檢查是否有進行中的局
                const savedId = localStorage.getItem('last_game_id');
                if (savedId) joinGameListener(savedId);
                
                // 如果在登入頁，就轉去大廳
                if (state.view === 'LoginView') setView('LobbyView');
            } else {
                // 登出重置
                state.view = 'LoginView';
                state.game = null;
                state.history = [];
            }
        });

        const loadUserData = (uid) => {
            onSnapshot(doc(db, 'users', uid), (snap) => {
                if (snap.exists()) {
                    const d = snap.data();
                    const raw = d.history || [];
                    state.history = raw.map(h => ({ ...h, dateStr: new Date(h.date).toLocaleDateString() }));
                    
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

        // --- Game Listener ---
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
                        alert("牌局已結束");
                        setView('LobbyView');
                    }
                }
            });
        };

        const handleCreate = async (name) => {
            const newId = await Game.createGame(name);
            if(newId) joinGameListener(newId);
        };

        const handleJoin = (code) => {
            if(code) joinGameListener(code);
        };

        const copyId = () => {
            navigator.clipboard.writeText(state.gameId);
            alert('已複製');
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
            handleCreate, handleJoin,
            addPlayer: Game.addPlayer,
            savePlayer: Game.savePlayer,
            removePlayer: Game.removePlayer,
            addBuy: (p) => Game.savePlayer({ ...p, buyIn: p.buyIn + 2000 }),
            bindSeat: Game.bindSeat,
            settle: Game.settleGame,
            goLobby: () => setView('LobbyView'),
            copyId
        };
    }
});

app.mount('#app');
