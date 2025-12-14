import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { auth, db } from './firebase-init.js';
import { state, setView } from './store.js';
import * as Auth from './auth.js';
import * as Game from './game.js';
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './components.js';

const app = createApp({
    setup() {
        // 全域 Auth 監聽 (App 一啟動就跑)
        onAuthStateChanged(auth, (u) => {
            state.user = u;
            if (u) {
                // 登入後，載入使用者生涯資料
                loadUserData(u.uid);
                // 檢查是否有進行中的局
                const savedId = localStorage.getItem('last_game_id');
                if (savedId) joinGameListener(savedId);
                
                // 如果在登入頁，就轉去大廳
                if (state.view === 'LoginView') setView('LobbyView');
            } else {
                state.view = 'LoginView';
                state.game = null;
                state.history = [];
            }
        });

        // 載入生涯資料監聽器
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

        // 加入遊戲監聽器
        let unsubGame = null;
        const joinGameListener = (id) => {
            if (unsubGame) unsubGame();
            unsubGame = onSnapshot(doc(db, 'games', id), (snap) => {
                if (snap.exists() && snap.data().status === 'active') {
                    state.game = { id: snap.id, ...snap.data() };
                    state.gameId = snap.id;
                    localStorage.setItem('last_game_id', id);
                    setView('GameView');
                } else {
                    // 局結束或不存在
                    state.game = null;
                    state.gameId = null;
                    localStorage.removeItem('last_game_id');
                    if (state.view === 'GameView') setView('LobbyView');
                }
            });
        };

        // 轉發介面事件到邏輯層
        const handleJoin = (code) => { if(code) joinGameListener(code); };
        
        return { 
            state, 
            setView,
            // Auth Actions
            handleAuth: Auth.handleAuth,
            guestLogin: Auth.guestLogin,
            logout: Auth.logout,
            // Game Actions
            createGame: Game.createGame,
            joinGame: handleJoin,
            addPlayer: Game.addPlayer,
            savePlayer: Game.savePlayer,
            removePlayer: Game.removePlayer,
            bindSeat: Game.bindSeat,
            addBuy: (p) => Game.savePlayer({ ...p, buyIn: p.buyIn + 2000 }),
            settle: Game.settleGame
        };
    }
});

// 註冊組件
app.component('LoginView', LoginView);
app.component('LobbyView', LobbyView);
app.component('GameView', GameView);
app.component('ReportView', ReportView);
app.component('ProfileView', ProfileView);

app.mount('#app');
