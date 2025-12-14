// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { firebaseConfig } from './config.js';

// 引入組件
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './views.js';

const app = createApp({
    setup() {
        // --- Firebase Init ---
        const fbApp = initializeApp(firebaseConfig);
        const auth = getAuth(fbApp);
        const db = getFirestore(fbApp);

        // --- Global State ---
        const user = ref(null);
        const currentViewName = ref('LoginView');
        const loading = ref(false);
        const error = ref('');
        
        // Data State
        const stats = ref({ games: 0, totalProfit: 0, winRate: 0 });
        const history = ref([]);
        const currentGame = ref(null);
        const currentGameId = ref(null);

        // --- Auth Logic ---
        onAuthStateChanged(auth, (u) => {
            user.value = u;
            if (u) {
                currentViewName.value = 'LobbyView';
                loadUserData(u.uid);
                // Check local storage for active game
                const savedGameId = localStorage.getItem('last_game_id');
                if (savedGameId) joinGame(savedGameId);
            } else {
                currentViewName.value = 'LoginView';
                currentGame.value = null;
                history.value = [];
            }
        });

        const handleAuth = async (type, form) => {
            loading.value = true;
            error.value = '';
            try {
                if (type === 'register') {
                    const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
                    await updateProfile(cred.user, { displayName: form.name });
                    await setDoc(doc(db, 'users', cred.user.uid), { name: form.name, email: form.email, createdAt: Date.now() });
                } else {
                    await signInWithEmailAndPassword(auth, form.email, form.password);
                }
            } catch (e) {
                error.value = e.message;
            } finally {
                loading.value = false;
            }
        };

        const guestLogin = async () => {
            loading.value = true;
            try {
                await signInAnonymously(auth);
            } catch (e) {
                error.value = "訪客登入需在 Firebase Console 開啟權限";
            } finally {
                loading.value = false;
            }
        };

        const logout = () => signOut(auth);

        // --- Data Loading ---
        const loadUserData = (uid) => {
            onSnapshot(doc(db, 'users', uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const rawHistory = data.history || [];
                    
                    // Process Stats
                    const games = rawHistory.length;
                    const totalProfit = rawHistory.reduce((sum, h) => sum + (h.profit / (h.rate || 1)), 0);
                    const wins = rawHistory.filter(h => h.profit > 0).length;
                    
                    stats.value = {
                        games, totalProfit,
                        winRate: games ? Math.round((wins/games)*100) : 0
                    };
                    
                    // Process History (for charts/list)
                    history.value = rawHistory.map(h => ({
                        ...h,
                        dateStr: new Date(h.date).toLocaleDateString()
                    }));
                }
            });
        };

        // --- Game Logic ---
        const createGame = async (name) => {
            const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
            const hostName = user.value.displayName || 'Guest';
            const docRef = await addDoc(collection(db, 'games'), {
                name, roomCode, hostUid: user.value.uid, status: 'active',
                players: [{ id: Date.now().toString(), name: hostName, uid: user.value.uid, buyIn: 2000, stack: 0 }]
            });
            joinGame(docRef.id);
        };

        let unsubGame = null;
        const joinGame = (gameId) => {
            if (unsubGame) unsubGame();
            unsubGame = onSnapshot(doc(db, 'games', gameId), (snap) => {
                if (snap.exists() && snap.data().status === 'active') {
                    currentGame.value = { id: snap.id, ...snap.data() };
                    currentGameId.value = snap.id;
                    localStorage.setItem('last_game_id', gameId);
                    currentViewName.value = 'GameView';
                } else {
                    currentGame.value = null;
                    localStorage.removeItem('last_game_id');
                    if(currentViewName.value === 'GameView') currentViewName.value = 'LobbyView';
                }
            });
        };

        const addPlayer = async (name) => {
            const p = { id: Date.now().toString(), name: name || '路人', uid: null, buyIn: 2000, stack: 0 };
            await updateDoc(doc(db, 'games', currentGameId.value), { players: arrayUnion(p) });
        };

        const savePlayer = async (p) => {
            const players = currentGame.value.players.map(old => old.id === p.id ? p : old);
            await updateDoc(doc(db, 'games', currentGameId.value), { players });
        };

        const removePlayer = async (p) => {
            if(!confirm('移除?')) return;
            const players = currentGame.value.players.filter(old => old.id !== p.id);
            await updateDoc(doc(db, 'games', currentGameId.value), { players });
        };

        const quickBuy = async (p) => {
            if(!confirm('加買 2000?')) return;
            p.buyIn += 2000; // optimistically update local logic, but better clone
            // In array update, we need whole array
            const players = currentGame.value.players.map(old => old.id === p.id ? { ...old, buyIn: old.buyIn + 2000 } : old);
            await updateDoc(doc(db, 'games', currentGameId.value), { players });
        };

        const bindSeat = async (p) => {
            const players = currentGame.value.players.map(old => 
                old.id === p.id ? { ...old, name: user.value.displayName || 'Guest', uid: user.value.uid } : old
            );
            await updateDoc(doc(db, 'games', currentGameId.value), { players });
        };

        const settleGame = async (rate) => {
            if (!confirm('確認結算？')) return;
            
            await runTransaction(db, async (t) => {
                const gameDoc = await t.get(doc(db, 'games', currentGameId.value));
                const players = gameDoc.data().players;
                
                // Update Users
                for (const p of players) {
                    if (p.uid) {
                        const userRef = doc(db, 'users', p.uid);
                        const userDoc = await t.get(userRef);
                        const record = {
                            date: new Date().toISOString(),
                            profit: (p.stack || 0) - p.buyIn,
                            rate: rate
                        };
                        
                        if (userDoc.exists()) {
                            t.update(userRef, { history: arrayUnion(record) });
                        } else {
                            t.set(userRef, { history: [record] }); // Handle new guest doc
                        }
                    }
                }
                t.update(doc(db, 'games', currentGameId.value), { status: 'completed' });
            });
            currentGame.value = null;
            currentViewName.value = 'ReportView'; // 結算後看報表
        };

        const copyId = () => {
             navigator.clipboard.writeText(currentGameId.value);
             alert('已複製 Game ID');
        };

        // --- Navigation ---
        const currentView = computed(() => {
            return { LoginView, LobbyView, GameView, ReportView, ProfileView }[currentViewName.value];
        });

        const changeView = (name) => {
            // 如果要去牌局頁但沒牌局，擋下來
            if (name === 'GameView' && !currentGame.value) return;
            currentViewName.value = name;
        };

        return {
            user, loading, error, stats, history, currentGame, currentView, currentViewName,
            handleAuth, guestLogin, logout, createGame, joinGame, changeView,
            addPlayer, savePlayer, removePlayer, quickBuy, bindSeat, settleGame, copyId
        };
    }
});

app.mount('#app');
