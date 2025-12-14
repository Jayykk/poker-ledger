import { ref, onMounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// Helper
const formatNumber = (n) => n?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") || '0';
const formatCash = (p, r) => { const val = p / (r || 1); return Number.isInteger(val) ? val : val.toFixed(1); };
const calcNet = (p) => (p.stack || 0) - p.buyIn;

export const LoginView = {
    props: ['loading', 'error'],
    template: `
    <div class="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
        <i class="fas fa-poker-chip text-7xl text-amber-500 animate-pulse mb-6"></i>
        <h2 class="text-3xl font-bold mb-8 text-white">Poker Sync</h2>
        <div class="w-full max-w-sm space-y-4">
            <button @click="$emit('guest')" :disabled="loading" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold border border-slate-600 flex justify-center items-center gap-2">
                <span v-if="loading" class="loader border-white/30 border-t-white"></span>
                <span>訪客試用 (免註冊)</span>
            </button>
            <div class="relative py-2"><span class="bg-[#0f172a] px-2 text-gray-500 text-xs">OR</span></div>
            <div class="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-3">
                <input v-model="form.email" type="email" placeholder="Email" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white">
                <input v-model="form.password" type="password" placeholder="密碼" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white">
                <input v-if="isReg" v-model="form.name" type="text" placeholder="暱稱" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white">
                <button @click="$emit('auth', isReg?'register':'login', form)" :disabled="loading" class="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold">
                    <span v-if="loading && !isReg" class="loader border-white/30 border-t-white mr-2"></span>
                    {{ isReg ? '註冊' : '登入' }}
                </button>
                <div class="text-xs text-gray-400 mt-2 cursor-pointer" @click="isReg=!isReg">{{ isReg ? '返回登入' : '註冊帳號' }}</div>
            </div>
            <div class="text-rose-400 text-xs h-4">{{ error }}</div>
        </div>
    </div>`,
    setup() { const isReg = ref(false); const form = ref({email:'',password:'',name:''}); return {isReg, form}; }
};

export const LobbyView = {
    props: ['stats', 'user'],
    template: `
    <div class="pt-8 px-4 pb-24">
        <h2 class="text-2xl font-bold text-white mb-6">大廳</h2>
        <div class="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-3xl border border-slate-700 shadow-xl mb-6">
            <div class="flex justify-between items-start mb-4">
                <div><div class="text-xs text-gray-400">生涯損益</div><div class="text-3xl font-mono font-bold" :class="stats.totalProfit>=0?'text-emerald-400':'text-rose-400'">{{ formatNumber(stats.totalProfit) }}</div></div>
                <div class="text-right"><div class="text-xs text-gray-400">場次</div><div class="font-bold text-white text-xl">{{ stats.games }}</div></div>
            </div>
            <div class="flex text-xs text-gray-500 justify-between"><span>勝率 {{ stats.winRate }}%</span><span v-if="user?.isAnonymous" class="text-amber-500">訪客</span></div>
        </div>
        <div class="grid gap-4">
            <div @click="showCreate=true" class="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex items-center gap-4 active:scale-95 transition cursor-pointer"><div class="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl"><i class="fas fa-plus"></i></div><div><h3 class="text-white font-bold">開新局</h3></div></div>
            <div @click="showJoin=true" class="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex items-center gap-4 active:scale-95 transition cursor-pointer"><div class="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xl"><i class="fas fa-sign-in-alt"></i></div><div><h3 class="text-white font-bold">加入房間</h3></div></div>
        </div>
        <div v-if="showCreate" class="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4" @click.self="showCreate=false"><div class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20"><input v-model="name" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white mb-4"><button @click="$emit('create', name)" class="w-full py-3 bg-amber-600 text-white rounded-xl font-bold">建立</button></div></div>
        <div v-if="showJoin" class="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4" @click.self="showJoin=false"><div class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20"><input v-model="code" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white mb-4" placeholder="Game ID"><button @click="$emit('join', code)" class="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold">加入</button></div></div>
    </div>`,
    setup() { return { showCreate:ref(false), showJoin:ref(false), name:ref('德州撲克'), code:ref(''), formatNumber }; }
};

export const GameView = {
    props: ['game', 'user'],
    template: `
    <div v-if="!game" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
        <p>目前沒有進行中的牌局</p>
        <button @click="$emit('go-lobby')" class="px-6 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white">前往大廳</button>
    </div>
    <div v-else class="pt-16 px-4 pb-24">
        <div class="fixed top-0 inset-x-0 z-30 bg-slate-800/90 backdrop-blur px-4 py-3 border-b border-slate-700 flex justify-between items-center max-w-md mx-auto">
            <span class="text-white font-bold">{{ game.name }}</span>
            <div class="text-right"><div class="text-[10px] text-gray-400">Pot</div><div class="font-mono text-amber-400 font-bold">{{ formatNumber(totalPot) }}</div></div>
        </div>
        <div class="space-y-3 mt-2">
            <div v-for="p in game.players" :key="p.id" class="bg-slate-800 rounded-2xl p-4 border relative overflow-hidden" :class="p.uid===user.uid?'border-amber-500/50':'border-slate-700'">
                <div class="absolute left-0 inset-y-0 w-1" :class="calcNet(p)>=0?'bg-emerald-500':'bg-rose-500'"></div>
                <div class="pl-3">
                    <div class="flex justify-between mb-3">
                        <div><div class="text-white font-bold flex gap-2 items-center">{{ p.name }} <button v-if="!p.uid" @click="$emit('bind', p)" class="text-[10px] bg-slate-600 px-2 rounded">認領</button><span v-if="p.uid" class="text-blue-400 text-[10px]">●</span></div><div class="text-xs text-gray-400 mt-1">Buy: {{ formatNumber(p.buyIn) }}</div></div>
                        <div class="text-right"><div class="text-2xl font-mono font-bold" :class="calcNet(p)>=0?'text-emerald-400':'text-rose-400'">{{ calcNet(p)>0?'+':''}}{{ formatNumber(calcNet(p)) }}</div></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <button @click="$emit('add-buy', p)" class="bg-slate-700/50 py-2 rounded-xl text-blue-300 text-xs">+買入</button>
                        <button @click="edit(p)" class="bg-slate-700/50 py-2 rounded-xl text-gray-300 text-xs">修改</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="mt-8 flex gap-3 justify-center">
            <button @click="$emit('copy-id')" class="px-4 py-2 bg-slate-800 text-gray-400 rounded-lg text-xs">複製 ID</button>
            <button @click="showSettlement=true" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">結算</button>
        </div>
        <button @click="showAdd=true" class="fixed bottom-24 right-4 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-xl shadow-lg"><i class="fas fa-plus"></i></button>
        <div v-if="showAdd" class="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4" @click.self="showAdd=false"><div class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20"><input v-model="newName" class="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white mb-4" placeholder="名"><button @click="$emit('add-player', newName);showAdd=false;newName=''" class="w-full py-3 bg-amber-600 text-white rounded-xl font-bold">加入</button></div></div>
        <div v-if="editingP" class="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4" @click.self="editingP=null"><div class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20">
            <div class="flex justify-between mb-4"><h3 class="text-white">{{ editingP.name }}</h3><button @click="$emit('remove-player', editingP);editingP=null" class="text-rose-500 text-xs">移除</button></div>
            <div class="mb-4 text-white text-sm">買入: <button @click="editingP.buyIn+=100" class="ml-2 bg-slate-700 px-2">+</button> {{ editingP.buyIn }} <button @click="editingP.buyIn-=100" class="bg-slate-700 px-2">-</button></div>
            <div class="mb-4"><label class="text-xs text-gray-400">籌碼</label><input v-model.number="editingP.stack" class="w-full bg-slate-900 text-white text-xl py-2 px-3 rounded mt-1"></div>
            <button @click="$emit('save-player', editingP);editingP=null" class="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold">儲存</button>
        </div></div>
        <div v-if="showSettlement" class="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4" @click.self="showSettlement=false"><div class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20 flex flex-col max-h-[80vh]">
            <h3 class="text-white font-bold mb-4">結算</h3>
            <div class="flex justify-between bg-slate-900 p-3 rounded mb-4"><span class="text-gray-400 text-sm">匯率</span><input v-model.number="rate" class="w-16 bg-slate-800 text-white text-center rounded"></div>
            <div class="space-y-2 mb-4 overflow-y-auto flex-1"><div v-for="p in game.players" class="flex justify-between text-sm py-1 border-b border-slate-700"><span class="text-white">{{ p.name }}</span><span :class="calcNet(p)>=0?'text-emerald-400':'text-rose-400'">{{ formatCash(calcNet(p), rate) }}</span></div></div>
            <button @click="$emit('settle', rate);showSettlement=false" class="w-full py-3 bg-amber-600 text-white rounded-xl font-bold">確認</button>
        </div></div>
    </div>`,
    setup(props, { emit }) {
        const showAdd = ref(false); const showSettlement = ref(false); const editingP = ref(null); const newName = ref(''); const rate = ref(10);
        const totalPot = computed(() => props.game?.players.reduce((a,b)=>a+b.buyIn,0)||0);
        const copyId = () => { navigator.clipboard.writeText(props.game.id); alert('ID 已複製'); };
        const edit = (p) => editingP.value = { ...p };
        return { showAdd, showSettlement, editingP, newName, rate, totalPot, copyId, edit, formatNumber, formatCash, calcNet };
    }
};

export const ReportView = {
    props: ['history'],
    template: `
    <div class="pt-8 px-4 pb-24">
        <h2 class="text-2xl font-bold text-white mb-6">報表分析</h2>
        <div class="bg-slate-800 p-4 rounded-2xl border border-slate-700 mb-6"><div class="relative h-64 w-full"><canvas id="chartCanvas"></canvas></div></div>
        <h3 class="text-sm font-bold text-gray-400 mb-2">歷史戰績</h3>
        <div v-if="history.length===0" class="text-center text-gray-500 py-6">暫無紀錄</div>
        <div class="space-y-3"><div v-for="(h, i) in history" :key="i" class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center"><div><div class="text-xs text-gray-400">{{ h.dateStr }}</div><div class="text-white font-bold">Game #{{ i+1 }}</div></div><div class="text-right"><div class="font-mono font-bold" :class="h.profit>=0?'text-emerald-400':'text-rose-400'">{{ h.profit>0?'+':''}}{{ formatNumber(h.profit) }}</div><div class="text-[10px] text-gray-500">Cash: {{ formatCash(h.profit, h.rate) }}</div></div></div></div>
    </div>`,
    setup(props) {
        let chart = null;
        const render = () => {
            const ctx = document.getElementById('chartCanvas'); if (!ctx) return;
            if (chart) chart.destroy();
            let acc = 0;
            const data = props.history.slice().reverse().map(h => { acc += (h.profit / (h.rate || 1)); return acc; });
            chart = new Chart(ctx, { type: 'line', data: { labels: props.history.map((_, i) => i+1), datasets: [{ label: '損益', data, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: '#334155' } } } } });
        };
        onMounted(() => setTimeout(render, 100));
        watch(() => props.history, render, { deep: true });
        return { formatNumber, formatCash };
    }
};

export const ProfileView = {
    props: ['user'],
    template: `
    <div class="pt-8 px-4 pb-24 text-center">
        <div class="w-20 h-20 bg-slate-700 rounded-full mx-auto flex items-center justify-center text-3xl mb-4"><i class="fas fa-user text-gray-400"></i></div>
        <h2 class="text-xl font-bold text-white mb-1">{{ user.isAnonymous ? '訪客' : user.displayName }}</h2>
        <div class="space-y-3 mt-8">
            <button @click="$emit('logout')" class="w-full py-3 bg-slate-800 text-rose-400 border border-slate-700 rounded-xl font-bold">登出</button>
        </div>
        <div class="mt-8 text-xs text-gray-600">Version 7.0.0 (Modular)</div>
    </div>`
};
