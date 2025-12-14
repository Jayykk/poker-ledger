import { reactive } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// 全域狀態
export const state = reactive({
    user: null,
    view: 'LoginView',
    loading: false,
    error: '',
    
    // 遊戲資料
    game: null,
    gameId: null,
    
    // 統計
    stats: { games: 0, totalProfit: 0, winRate: 0 },
    history: []
});

// 切換頁面
export const setView = (viewName) => {
    // 簡單的路由守衛：如果沒登入，強制回登入頁
    if (!state.user && viewName !== 'LoginView') {
        state.view = 'LoginView';
        return;
    }
    // 如果要去牌局頁但沒牌局，留在原地並提示
    if (viewName === 'GameView' && !state.game) {
        alert("目前沒有進行中的牌局，請先開局或加入。");
        return;
    }
    state.view = viewName;
    state.error = '';
};

export const setLoading = (bool) => state.loading = bool;
