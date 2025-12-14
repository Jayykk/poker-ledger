import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { firebaseConfig } from './config.js';
import { LoginView, LobbyView, GameView, ReportView, ProfileView } from './views.js';

const app = createApp({
    setup() {
        // Init
        const fbApp = initializeApp(firebaseConfig);
        const auth = getAuth(fbApp);
        const db = getFirestore(fbApp);

        // State
        const user = ref(null);
        const currentViewName = ref('LoginView');
        const loading = ref(false);
        const error = ref('');
        const stats = ref({ games: 0, totalProfit: 0, winRate: 0 });
        const history = ref([]);
        const currentGame = ref(null);
        const currentGameId = ref(null);

        // Auth
        onAuthStateChanged(auth, (u) => {
            user.value = u;
            if (u) {
                currentViewName.value = 'LobbyView';
                loadUserData(u.uid);
                const savedId = localStorage.getItem('last_game_id');
                if (savedId) joinGame(savedId);
            } else {
                currentViewName.value = 'LoginView';
                currentGame.value = null;
            }
        });

        const handleAuth = async (type, form) => {
            loading.value = true; error.value = '';
            try {
                if (type === 'register') {
                    const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
                    await updateProfile(cred.user, { displayName: form.name });
                    await setDoc(doc(db, 'users', cred.user.uid), { name: form.name, email: form.email, createdAt: Date.now() });
                } else {
                    await signInWithEmailAndPassword(auth, form.email, form.password);
                }
            } catch (e) { error.value = e.message; } finally { loading.value = false; }
        };

        const guestLogin = async () => {
            loading.value = true;
            try { await signInAnonymously(auth); } 
            catch (e) { error.value = "請先在 Firebase Console 開啟匿名登入權限"; } 
            finally { loading.value = false; }
        };

        const logout = () => signOut(auth);

        // Data
        const loadUserData = (uid) => {
            onSnapshot(doc(db, 'users', uid), (snap) => {
                if (snap.exists()) {
                    const d = snap.data();
                    const raw = d.history || [];
                    history.value = raw.map(h => ({ ...h, dateStr: new Date(h.date).toLocaleDateString() }));
                    const profit = raw.reduce((sum, h) => sum + (h.profit / (h.rate || 1)), 0);
                    const wins = raw.filter(h => h.profit > 0).length;
                    stats.value = { games: raw.length, totalProfit: profit, winRate: raw.length ? Math.round((wins/raw.length)*100) : 0 };
                }
            });
        };

        // Game
        const createGame = async (name) => {
            const hostName = user.value.displayName || 'Guest';
            const docRef = await addDoc(collection(db, 'games'), {
                name, roomCode: '0000', hostUid: user.value.uid, status: 'active',
                players: [{ id: Date.now().toString(), name: hostName, uid: user.value.uid, buyIn: 2000, stack: 0 }]
            });
            joinGame(docRef.id);
        };

        let unsubGame = null;
        const joinGame = (id) => {
            if (unsubGame) unsubGame();
            unsubGame = onSnapshot(doc(db, 'games', id), (snap) => {
                if (snap.exists() && snap.data().status === 'active') {
                    currentGame.value = { id: snap.id, ...snap.data() };
                    currentGameId.value = snap.id;
                    localStorage.setItem('last_game_id', id);
                    currentViewName.value = 'GameView';
                } else {
                    currentGame.value = null;
                    localStorage.removeItem('last_game_id');
                    if(currentViewName.value === 'GameView') currentViewName.value = 'LobbyView';
                }
            });
        };

        // Actions
        const addPlayer = async (name) => updateDoc(doc(db, 'games', currentGameId.value), { players: arrayUnion({ id: Date.now().toString(), name: name || '路人', uid: null, buyIn: 2000, stack: 0 }) });
        const savePlayer = async (p) => updateDoc(doc(db, 'games', currentGameId.value), { players: currentGame.value.players.map(old => old.id === p.id ? p : old) });
        const removePlayer = async (p) => updateDoc(doc(db, 'games', currentGameId.value), { players: currentGame.value.players.filter(old => old.id !== p.id) });
        const quickBuy = async (p) => savePlayer({ ...p, buyIn: p.buyIn + 2000 });
        const bindSeat = async (p) => savePlayer({ ...p, name: user.value.displayName || 'Guest', uid: user.value.uid });
        const copyId = () => { navigator.clipboard.writeText(currentGameId.value); alert('已複製 ID'); };

        const settleGame = async (rate) => {
            if (!confirm('確認結算？')) return;
            await runTransaction(db, async (t) => {
                const gameDoc = await t.get(doc(db, 'games', currentGameId.value));
                const players = gameDoc.data().players;
                for (const p of players) {
                    if (p.uid) {
                        const userRef = doc(db, 'users', p.uid);
                        const userDoc = await t.get(userRef);
                        const record = { date: new Date().toISOString(), profit: (p.stack || 0) - p.buyIn, rate };
                        if (userDoc.exists()) t.update(userRef, { history: arrayUnion(record) });
                        else t.set(userRef, { history: [record] });
                    }
                }
                t.update(doc(db, 'games', currentGameId.value), { status: 'completed' });
            });
            currentViewName.value = 'ReportView';
        };

        const currentView = computed(() => ({ LoginView, LobbyView, GameView, ReportView, ProfileView }[currentViewName.value]));
        const changeView = (name) => {
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
