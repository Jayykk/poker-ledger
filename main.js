// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, watch, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// 匯入設定檔
import { firebaseConfig } from './config.js';

const app = createApp({
    setup() {
        // --- 初始化 Firebase ---
        let fbApp, auth, db;
        const firebaseReady = ref(false);

        // --- 狀態變數 ---
        const user = ref(null);
        const currentGame = ref(null);
        const currentGameId = ref(null);
        const careerStats = ref({ games: 0, totalProfit: 0, winRate: 0 });

        // UI 控制
        const showConfigModal = ref(false); // 雖然我們現在有 config.js，但保留邏輯以防萬一
        const showAuthModal = ref(false);
        const showAddPlayerModal = ref(false);
        const showSettlementModal = ref(false);
        const loading = ref(false);
        const isRegistering = ref(false);
        const authForm = ref({ email: '', password: '', name: '' });
        const authError = ref('');

        // 遊戲變數
        const newGameName = ref('德州撲克局');
        const joinRoomCode = ref('');
        const newPlayerName = ref('');
        const defaultBuyIn = ref(2000);
        const exchangeRate = ref(10); // 匯率

        // 編輯變數
        const editingPlayer = ref(null);
        const editTempBuyIn = ref(0);
        const editTempStack = ref(0);

        // --- 初始化 ---
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
                    }
                });
            } catch (e) {
                console.error("Firebase Init Error:", e);
                alert("Firebase 連線失敗");
            }
        };

        // --- 認證邏輯 ---
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

        const logout = () => signOut(auth);

        // --- 生涯統計 ---
        const loadCareerStats = (uid) => {
            onSnapshot(doc(db, 'users', uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const history = data.history || [];
                    const games = history.length;
                    const totalProfit = history.reduce((sum, h) => sum + (h.profit / (h.rate || 1)), 0);
                    const wins = history.filter(h => h.profit > 0).length;
                    careerStats.value = {
                        games, 
                        totalProfit,
                        winRate: games ? Math.round((wins/games)*100) : 0
                    };
                }
            });
        };

        // --- 遊戲邏輯 ---
        const createGame = async () => {
            if (!user.value) return;
            loading.value = true;
            try {
                const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
                const gameRef = await addDoc(collection(db, 'games'), {
                    name: newGameName.value,
                    roomCode: roomCode,
                    hostUid: user.value.uid,
                    createdAt: Date.now(),
                    status: 'active',
                    players: [
                        { id: Date.now().toString(), name: user.value.displayName, uid: user.value.uid, buyIn: defaultBuyIn.value, buyInCount: 1, stack: 0 }
                    ]
                });
                joinGameById(gameRef.id);
            } catch (e) {
                alert('開局失敗: ' + e.message);
            } finally {
                loading.value = false;
            }
        };

        const joinGame = async () => {
            // 這裡簡單處理：假設輸入的是 Game ID (雖然 placeholder 寫房號)
            // 實際專案需要 query roomCode，但純前端簡單做直接用 ID 比較穩
            if (joinRoomCode.value.length < 5) {
                alert("請輸入完整的 Game ID (長字串)");
                return;
            }
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

        // --- 牌局內操作 ---
        const totalPot = computed(() => currentGame.value ? currentGame.value.players.reduce((sum, p) => sum + p.buyIn, 0) : 0);
        const totalStack = computed(() => {
            if (!currentGame.value) return 0;
            // 計算目前桌上所有人設定的 stack 總和 (結算時才準)
            return currentGame.value.players.reduce((sum, p) => sum + (p.stack || 0), 0);
        });
        const balanceGap = computed(() => totalStack.value - totalPot.value);
        
        const hasBoundSeat = computed(() => {
            return currentGame.value && currentGame.value.players.some(p => p.uid === user.value.uid);
        });

        const calculateNet = (p) => (p.stack || 0) - p.buyIn;

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
            await updateDoc(doc(db, 'games', currentGameId.value), {
                players: arrayUnion(newPlayer)
            });
            showAddPlayerModal.value = false;
            newPlayerName.value = '';
        };

        const bindSeat = async (player) => {
            if (!confirm(`確定要坐在 ${player.name} 的位置嗎？(綁定紀錄)`)) return;
            const newPlayers = currentGame.value.players.map(p => {
                if (p.id === player.id) return { ...p, name: user.value.displayName, uid: user.value.uid };
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

        // --- 結算 ---
        const formatCash = (n) => {
            const val = n / exchangeRate.value;
            return Number.isInteger(val) ? val : val.toFixed(1);
        };
        const formatNumber = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

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
                            if (userSnap.exists()) {
                                const record = {
                                    gameId: currentGameId.value,
                                    date: new Date().toISOString(),
                                    profit: calculateNet(p),
                                    rate: exchangeRate.value
                                };
                                transaction.update(userRef, { history: arrayUnion(record) });
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
                alert('結算失敗: ' + e.message);
            } finally {
                loading.value = false;
            }
        };

        return {
            firebaseReady, user, showAuthModal, authForm, isRegistering, authError, handleAuth, logout,
            careerStats, newGameName, joinRoomCode, createGame, joinGame, exitGame, loading,
            currentGame, currentGameId, totalPot, balanceGap, hasBoundSeat, calculateNet,
            showAddPlayerModal, newPlayerName, defaultBuyIn, addPlayerToGame,
            bindSeat, quickBuyIn, openEditModal, editingPlayer, editTempBuyIn, editTempStack, savePlayerEdit, removePlayerFromGame,
            showSettlementModal, exchangeRate, formatCash, formatNumber, settleGame
        };
    }
});

app.mount('#app');
