import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, computed, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { auth, db } from './firebase-init.js';
import { state, setView } from './store.js';
import * as Auth from './auth.js';
import * as Game from './game.js';
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './views.js';

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

const app = createApp({
    setup() {
        onAuthStateChanged(auth, (u) => {
            state.user = u;
            if (u) {
                loadUserData(u.uid);
                // Process pending invite after login
                if (state.pendingInvite) {
                    const { gameId, seatId } = state.pendingInvite;
                    state.pendingInvite = null;
                    if (showConfirm(`檢測到邀請連結，是否入座該局？`)) {
                        Game.joinByBinding(gameId, seatId).then(success => {
                            if (success) joinGameListener(gameId);
                        });
                    }
                } else {
                    checkUrlParams();
                    const savedId = localStorage.getItem('last_game_id');
                    if (!state.gameId && savedId) joinGameListener(savedId);
                }
                if (state.view === 'LoginView') setView('LobbyView');
            } else {
                // User not logged in, check for invite link
                checkUrlParams();
                state.view = 'LoginView';
                state.game = null;
                state.history = [];
            }
        });

        const checkUrlParams = async () => {
            const params = new URLSearchParams(window.location.search);
            const gameId = params.get('game');
            const seatId = params.get('seat');
            if (gameId && seatId) {
                window.history.replaceState({}, document.title, window.location.pathname);
                if (!state.user) {
                    // User not logged in, store invite for later
                    state.pendingInvite = { gameId, seatId };
                    showNotification('請先選擇登入方式', 'warning');
                } else {
                    // User already logged in
                    if (showConfirm(`檢測到邀請連結，是否入座該局？`)) {
                        const success = await Game.joinByBinding(gameId, seatId);
                        if (success) joinGameListener(gameId);
                    }
                }
            }
        };

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
                        showNotification("牌局已結束或被解散", 'warning');
                        setView('LobbyView');
                    }
                }
            });
        };

        const handleCreate = async (name) => {
            const newId = await Game.createGame(name);
            if(newId) joinGameListener(newId);
        };

        const handleCheckGame = async (code, callback) => {
            console.log("【Main】收到 check-game，準備呼叫 Game Logic", code); // LOG 4
            const result = await Game.checkGameStatus(code);
            console.log("【Main】Game Logic 回傳:", result); // LOG 5
            callback(result);
        };

        const handleBindJoin = async (code, pid) => {
            const success = await Game.joinByBinding(code, pid);
            if(success) joinGameListener(code);
        };

        const handleNewJoin = async (code, buyIn) => {
            const success = await Game.joinAsNewPlayer(code, buyIn);
            if(success) joinGameListener(code);
        };

        const handleJoinDirect = (code) => {
            joinGameListener(code);
        };

        const handleBindSeat = async (p) => {
            const success = await Game.bindSeat(p);
        };

        const handleCloseGame = async () => {
            console.log("【Main】收到 close-game，呼叫 Game.closeGame"); // LOG 6
            await Game.closeGame();
        };

        const copyId = () => {
            navigator.clipboard.writeText(state.gameId);
            showNotification('已複製 ID', 'success');
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
            
            // Handlers
            handleCheckGame, handleBindJoin, handleNewJoin, handleJoin: handleJoinDirect,

            addPlayer: Game.addPlayer,
            savePlayer: Game.savePlayer,
            removePlayer: Game.removePlayer,
            addBuy: (p) => Game.savePlayer({ ...p, buyIn: p.buyIn + 2000 }),
            bindSeat: handleBindSeat,
            settle: Game.settleGame,
            closeGame: handleCloseGame, // 🔥 這裡綁定上面的 log wrapper
            goLobby: () => setView('LobbyView'),
            copyId
        };
    }
});

app.mount('#app');
