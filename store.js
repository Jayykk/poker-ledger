import { reactive } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

export const state = reactive({
    user: null,
    view: 'LoginView',
    loading: false,
    error: '',
    
    // 遊戲資料
    game: null,
    gameId: null,
    
    // 統計資料
    stats: { games: 0, totalProfit: 0, winRate: 0 },
    history: [],
    
    // 待處理的邀請
    pendingInvite: null
});

export const setView = (viewName) => {
    if (!state.user && viewName !== 'LoginView') {
        state.view = 'LoginView';
        return;
    }
    if (viewName === 'GameView' && !state.game) {
        alert("目前無進行中的牌局");
        return;
    }
    state.view = viewName;
    state.error = '';
};

export const setLoading = (bool) => state.loading = bool;
