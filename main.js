import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { auth, db } from './firebase-init.js';
import { state, setView } from './store.js';
import * as Auth from './auth.js';
import * as Game from './game.js';
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './components.js';

const app = createApp({
    setup() {
        // --- 1. 監聽登入狀態 ---
        onAuthStateChanged(auth, (u) => {
            state.user = u;
            if (u) {
                // 登入成功 -> 載入資料
                loadUserData(u.uid);
                // 檢查是否有上次未完成的局
                const savedId = localStorage.getItem('last_game_id');
                if (savedId) joinGameListener(savedId);
                
                // 如果還在登入頁，就轉去大廳
                if (state.view === 'LoginView') setView('LobbyView');
            } else {
                // 登出 -> 回首頁，清空資料
                state.view = 'LoginView';
                state.game = null;
                state.history = [];
            }
        });

        // --- 2. 監聽使用者資料 (生涯) ---
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

        // --- 3. 監聽牌局 (核心) ---
        let unsubGame = null;
        const joinGameListener = (id) => {
            if (unsubGame) unsubGame();
            
            // 開始監聽這場局
            unsubGame = onSnapshot(doc(db, 'games', id), (snap) => {
                if (snap.exists() && snap.data().status === 'active') {
                    // 局存在且進行中 -> 更新狀態 -> 轉跳頁面
                    state.game = { id: snap.id, ...snap.data() };
                    state.gameId = snap.id;
                    localStorage.setItem('last_game_id', id);
                    
                    // 自動轉跳到遊戲頁 (如果還沒在那)
                    if (state.view !== 'GameView') setView('GameView');
                } else {
                    // 局結束或不存在
                    state.game = null;
                    state.gameId = null;
                    localStorage.removeItem('last_game_id');
                    
                    // 如果使用者正看著這場局，把他踢回大廳
                    if (state.view === 'GameView') {
                        alert("牌局已結束或不存在");
                        setView('LobbyView');
                    }
                }
            });
        };

        // --- 4. 事件處理器 (串接 UI 與 Logic) ---
        
        // 處理開局
        const handleCreate = async (name) => {
            const newGameId = await Game.createGame(name);
            if (newGameId) {
                joinGameListener(newGameId); // 拿到 ID 後，馬上監聽並進入
            }
        };

        // 處理加入
        const handleJoin = (code) => {
            if(code) joinGameListener(code);
        };

        // 複製 ID
        const copyId = () => {
            if(state.gameId) {
                navigator.clipboard.writeText(state.gameId);
                alert('ID 已複製');
            }
        };

        // 計算當前要顯示哪個組件
        const currentViewComponent = computed(() => {
            const views = { LoginView, LobbyView, GameView, ReportView, ProfileView };
            return views[state.view] || LoginView;
        });

        return { 
            state, 
            setView, // 必須回傳這個，下方的 nav bar 才能用
            currentViewComponent,
            
            // Auth Actions
            handleAuth: Auth.handleAuth,
            guestLogin: Auth.guestLogin,
            logout: Auth.logout,
            
            // Game Actions
            handleCreate, // 改用包裝過的方法
            handleJoin,   // 改用包裝過的方法
            
            // Passthrough to Game Logic
            addPlayer: Game.addPlayer,
            savePlayer: Game.savePlayer,
            removePlayer: Game.removePlayer,
            bindSeat: Game.bindSeat,
            addBuy: (p) => Game.savePlayer({ ...p, buyIn: p.buyIn + 2000 }),
            settle: Game.settleGame,
            copyId
        };
    }
});

app.mount('#app');
