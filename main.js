// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, watch, onMounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { firebaseConfig } from './config.js';

const app = createApp({
    setup() {
        // --- 初始化 ---
        let fbApp, auth, db;
        const firebaseReady = ref(false);

        // --- State ---
        const user = ref(null);
        const lobbyTab = ref('overview'); // overview, chart, history
        const careerStats = ref({ games: 0, totalProfit: 0, winRate: 0, wins: 0 });
        const historyList = ref([]); // 詳細歷程資料
        
        // Game State
        const currentGame = ref(null);
        const currentGameId = ref(null);

        // UI State
        const showAuthModal = ref(false);
        const showAddPlayerModal = ref(false);
        const showSettlementModal = ref(false);
        const loading = ref(false);
        const isRegistering = ref(false);
        const authForm = ref({ email: '', password: '', name: '' });
        const authError = ref('');

        // Inputs
        const newGameName = ref('德州撲克局');
        const joinRoomCode = ref('');
        const newPlayerName = ref('');
        const defaultBuyIn = ref(2000);
        const exchangeRate = ref(10);

        // Edit
        const editingPlayer = ref(null);
        const editTempBuyIn = ref(0);
        const editTempStack = ref(0);

        // Chart Instance
        let chartInstance = null;

        onMounted(() => {
            initFirebase();
        });

        const initFirebase = () => {
            try {
                fbApp = initializeApp(firebaseConfig);
                auth = getAuth(fbApp);
                db = getFirestore(fbApp);
                firebaseReady.value = true;

                onAuthStateChanged(auth, (u) => {
                    user.value = u;
                    if (u) {
                        showAuthModal.value = false;
                        loadCareerStats(u.uid);
                        const lastGameId = localStorage.getItem('last_game_id');
                        if (lastGameId) joinGameById(lastGameId);
                    } else {
                        currentGame.value = null;
                        careerStats.value = { games: 0, totalProfit: 0, winRate: 0, wins: 0 };
                        if (chartInstance) chartInstance.destroy();
                    }
                });
            } catch (e) {
                console.error(e);
                alert("Firebase 連線失敗");
            }
        };

        // --- Auth (含訪客) ---
        const handleAuth = async () => {
            loading.value = true;
            authError.value = '';
            try {
                if (isRegistering.value) {
                    const cred = await createUserWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
                    await updateProfile(cred.user, { displayName: authForm.value.name });
                    await setDoc(doc(db, 'users', cred.user.uid), { 
                        name: authForm.value.name, 
                        email: authForm.value.email,
                        createdAt: Date.now() 
                    });
                } else {
                    await signInWithEmailAndPassword(auth, authForm.value.email, authForm.value.password);
                }
            } catch (e) {
                authError.value = e.message;
            } finally {
                loading.value = false;
            }
        };

        const guestLogin = async () => {
            loading.value = true;
            try {
                await signInAnonymously(auth);
                // 訪客登入成功，會觸發 onAuthStateChanged，自動進入大廳
            } catch (e) {
                alert("訪客登入失敗: " + e.message);
            } finally {
                loading.value = false;
            }
        };

        const logout = () => signOut(auth);

        // --- 生涯 & 圖表 ---
        const loadCareerStats = (uid) => {
            onSnapshot(doc(db, 'users', uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const history = data.history || [];
                    
                    // 1. 計算統計
                    const games = history.length;
                    const totalProfit = history.reduce((sum, h) => sum + (h.profit / (h.rate || 1)), 0);
                    const wins = history.filter(h => h.profit > 0).length;
                    
                    careerStats.value = {
                        games, 
                        totalProfit,
                        wins,
                        winRate: games ? Math.round((wins/games)*100) : 0
                    };

                    // 2. 準備列表 (反序)
                    historyList.value = history.map(h => ({
                        ...h,
                        dateStr: new Date(h.date).toLocaleDateString()
                    })).reverse();

                    // 3. 畫圖 (延遲一下確保 DOM 存在)
                    nextTick(() => {
                        renderChart(history);
                    });
                } else {
                    // 新使用者或訪客尚未有資料
                    careerStats.value = { games: 0, totalProfit: 0, winRate: 0, wins: 0 };
                    historyList.value = [];
                }
            });
        };

        const renderChart = (history) => {
            const ctx = document.getElementById('profitChart');
            if (!ctx) return;
            
            // 銷毀舊圖表
            if (chartInstance) chartInstance.destroy();

            // 準備數據：計算「累計」損益
            let cumulative = 0;
            const dataPoints = history.map((h, i) => {
                const profit = h.profit / (h.rate || 1);
                cumulative += profit;
                return cumulative;
            });
            const labels = history.map((h, i) => `Game ${i+1}`);

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '累計損益 (Cash)',
                        data: dataPoints,
                        borderColor: '#10b981', // Emerald 500
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            grid: { color: '#334155' }, // Slate 700
                            ticks: { color: '#94a3b8' } // Slate 400
                        },
                        x: {
                            display: false // 隱藏 X 軸標籤避免擁擠
                        }
                    }
                }
            });
        };

        // --- Game Logic ---
        // (保持之前的邏輯，省略重複部分，確保 calculateNet, formatNumber 等都在)
        
        const createGame = async () => {
            if (!user.value) return;
            loading.value = true;
            try {
                // 如果是訪客，使用 "Guest" 當名字
                const hostName = user.value.displayName || 'Guest';
                const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
                const gameRef = await addDoc(collection(db, 'games'), {
                    name: newGameName.value,
                    roomCode: roomCode,
                    hostUid: user.value.uid,
                    createdAt: Date.now(),
                    status: 'active',
                    players: [
                        { id: Date.now().toString(), name: hostName, uid: user.value.uid, buyIn: defaultBuyIn.value, buyInCount: 1, stack: 0 }
                    ]
                });
                joinGameById(gameRef.id);
            } catch (e) {
                alert('開局失敗: ' + e.message);
            } finally {
                loading.value = false;
            }
        };

        // ... (JoinGame, ExitGame, BindSeat, SettleGame 等邏輯與 V5 相同，請直接從之前的程式碼複製過來，確保完整性)
        // 注意：BindSeat 內的 displayName 也要判斷訪客
        
        const joinGame = async () => {
            if (joinRoomCode.value.length < 5) return alert("請輸入 Game ID");
            loading.value = true;
            joinGameById(joinRoomCode.value);
        };

        let unsubscribeGame = null;
        const joinGameById = (gameId) => {
            if (unsubscribeGame) unsubscribeGame();
            unsubscribeGame = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.status === 'completed') {
                        alert('局已結束');
                        currentGame.value = null;
                        localStorage.removeItem('last_game_id');
                        return;
                    }
                    currentGame.value = { id: docSnap.id, ...data };
                    currentGameId.value = docSnap.id;
                    localStorage.setItem('last_game_id', gameId);
                } else {
                    alert('找不到房間');
                    currentGame.value = null;
                }
                loading.value = false;
            });
        };

        const exitGame = () => {
            if (unsubscribeGame) unsubscribeGame();
            currentGame.value = null;
            currentGameId.value = null;
            localStorage.removeItem('last_game_id');
        };
        
        // Computed Helpers
        const totalPot = computed(() => currentGame.value ? currentGame.value.players.reduce((sum, p) => sum + p.buyIn, 0) : 0);
        const totalStack = computed(() => currentGame.value ? currentGame.value.players.reduce((sum, p) => sum + (p.stack||0), 0) : 0);
        const balanceGap = computed(() => totalStack.value - totalPot.value);
        const hasBoundSeat = computed(() => currentGame.value && currentGame.value.players.some(p => p.uid === user.value.uid));
        const calculateNet = (p) => (p.stack || 0) - p.buyIn;
        const formatNumber = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        const formatCash = (n) => {
            const val = n / exchangeRate.value;
            return Number.isInteger(val) ? val : val.toFixed(1);
        };

        // Actions
        const addPlayerToGame = async () => {
            if (!currentGame.value) return;
            const newPlayer = {
                id: Date.now().toString(),
                name: newPlayerName.value || '路人',
                uid: null,
                buyIn: defaultBuyIn.value,
                buyInCount: 1,
                stack: 0
            };
            await updateDoc(doc(db, 'games', currentGameId.value), { players: arrayUnion(newPlayer) });
            showAddPlayerModal.value = false;
            newPlayerName.value = '';
        };

        const bindSeat = async (player) => {
            if (!confirm(`確定要坐在 ${player.name} 的位置嗎？`)) return;
            const userName = user.value.displayName || 'Guest';
            const newPlayers = currentGame.value.players.map(p => {
                if (p.id === player.id) return { ...p, name: userName, uid: user.value.uid };
                return p;
            });
            await updateDoc(doc(db, 'games', currentGameId.value), { players: newPlayers });
        };

        const quickBuyIn = async (player) => {
            if(!confirm(`幫 ${player.name} 加買?`)) return;
            const newPlayers = currentGame.value.players.map(p => {
                if (p.id === player.id) return { ...p, buyIn: p.buyIn + defaultBuyIn.value, buyInCount: p.buyInCount + 1 };
                return p;
            });
            await updateDoc(doc(db, 'games', currentGameId.value), { players: newPlayers });
        };

        const openEditModal = (p) => {
            editingPlayer.value = p;
            editTempBuyIn.value = p.buyIn;
            editTempStack.value = p.stack;
        };

        const savePlayerEdit = async () => {
            if (!editingPlayer.value) return;
            const newPlayers = currentGame.value.players.map(p => {
                if (p.id === editingPlayer.value.id) return { ...p, buyIn: editTempBuyIn.value, stack: editTempStack.value };
                return p;
            });
            await updateDoc(doc(db, 'games', currentGameId.value), { players: newPlayers });
            editingPlayer.value = null;
        };
        
        const removePlayerFromGame = async () => {
            if(!confirm('移除此玩家?')) return;
            const newPlayers = currentGame.value.players.filter(p => p.id !== editingPlayer.value.id);
            await updateDoc(doc(db, 'games', currentGameId.value), { players: newPlayers });
            editingPlayer.value = null;
        };

        const settleGame = async () => {
            if (!confirm('確定結算並寫入大家生涯紀錄嗎？\n(此操作不可逆)')) return;
            loading.value = true;
            try {
                await runTransaction(db, async (transaction) => {
                    const gameRef = doc(db, 'games', currentGameId.value);
                    const gameSnap = await transaction.get(gameRef);
                    if (!gameSnap.exists()) throw "Game error";
                    const players = gameSnap.data().players;
                    
                    for (const p of players) {
                        if (p.uid) {
                            const userRef = doc(db, 'users', p.uid);
                            const userSnap = await transaction.get(userRef);
                            // 如果是新訪客，user doc 可能不存在，setDoc 比較安全，但 transaction 需要 read-write
                            if (userSnap.exists()) {
                                const record = {
                                    gameId: currentGameId.value,
                                    date: new Date().toISOString(),
                                    profit: calculateNet(p),
                                    rate: exchangeRate.value
                                };
                                transaction.update(userRef, { history: arrayUnion(record) });
                            } else {
                                // 訪客第一次結算，建立文檔
                                const record = {
                                    gameId: currentGameId.value,
                                    date: new Date().toISOString(),
                                    profit: calculateNet(p),
                                    rate: exchangeRate.value
                                };
                                transaction.set(userRef, { 
                                    name: p.name, 
                                    createdAt: Date.now(),
                                    history: [record]
                                });
                            }
                        }
                    }
                    transaction.update(gameRef, { status: 'completed' });
                });
                alert('結算完成！');
                currentGame.value = null;
                localStorage.removeItem('last_game_id');
                showSettlementModal.value = false;
            } catch (e) {
                console.error(e);
                alert('結算失敗: ' + e.message);
            } finally {
                loading.value = false;
            }
        };

        return {
            user, lobbyTab, careerStats, historyList,
            currentGame, currentGameId, totalPot, balanceGap, hasBoundSeat, calculateNet,
            showAuthModal, authForm, isRegistering, authError, handleAuth, guestLogin, logout,
            newGameName, joinRoomCode, createGame, joinGame, exitGame, loading,
            showAddPlayerModal, newPlayerName, defaultBuyIn, addPlayerToGame,
            bindSeat, quickBuyIn, openEditModal, editingPlayer, editTempBuyIn, editTempStack, savePlayerEdit, removePlayerFromGame,
            showSettlementModal, exchangeRate, formatCash, formatNumber, settleGame
        };
    }
});

app.mount('#app');
