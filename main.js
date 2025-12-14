// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"; // 建議使用穩定版本或與你config一致
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { createApp, ref, computed, watch, onMounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// 引入剛剛寫好的設定檔
import { firebaseConfig } from './config.js';

const app = createApp({
    setup() {
        // --- 初始化 Firebase ---
        const fbApp = initializeApp(firebaseConfig);
        const analytics = getAnalytics(fbApp);
        const auth = getAuth(fbApp);
        const db = getFirestore(fbApp);

        // --- 狀態變數 (State) ---
        const user = ref(null);
        const currentGame = ref(null);
        const currentGameId = ref(null);
        const showSettlementModal = ref(false); // 控制結算視窗
        const exchangeRate = ref(10); // 匯率
        const loading = ref(false);

        // 這裡省略了其他變數定義 (如 showConfigModal, players 等)，
        // 請將原本 script 標籤內的 setup() 邏輯完整搬過來，
        // 但記得移除 firebaseConfig 的定義，因為已經改用 import 了。

        // --- 計算屬性 (Computed) ---
        const totalPot = computed(() => currentGame.value ? currentGame.value.players.reduce((sum, p) => sum + p.buyIn, 0) : 0);
        // 假設有 totalStack 的計算
        const totalStack = computed(() => {
            if (!currentGame.value) return 0;
            // 這裡假設結算時會手動輸入 stack，或是即時更新
            return currentGame.value.players.reduce((sum, p) => sum + (p.stack || 0), 0);
        });
        const balanceGap = computed(() => totalStack.value - totalPot.value);

        // --- 方法 (Methods) ---
        const calculateNet = (p) => (p.stack || 0) - p.buyIn;

        const formatCash = (n) => {
            const val = n / exchangeRate.value;
            return Number.isInteger(val) ? val : val.toFixed(1);
        };
        
        const formatNumber = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        // ... 其他登入、加入房間、綁定座位的邏輯 ...
        // 請確保原本的 function 都還在

        return {
            user, currentGame, showSettlementModal, exchangeRate, loading,
            balanceGap, calculateNet, formatCash, formatNumber,
            // ... 回傳所有需要的變數與方法
        };
    }
});

app.mount('#app');
