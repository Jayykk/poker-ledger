import { reactive } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

export const state = reactive({
    user: null,              // 目前登入者
    view: 'LoginView',       // 目前顯示的頁面
    loading: false,          // 讀取圈圈
    error: '',               // 錯誤訊息
    
    // 遊戲資料
    game: null,              // 當前牌局物件
    gameId: null,            // 當前牌局 ID
    
    // 統計資料
    stats: { games: 0, totalProfit: 0, winRate: 0 },
    history: []
});

// 切換頁面功能
export const setView = (viewName) => {
    state.view = viewName;
    state.error = ''; // 切換頁面時清空錯誤
};

// 設定讀取狀態
export const setLoading = (bool) => state.loading = bool;
