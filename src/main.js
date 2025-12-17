import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import pinia from './store/index.js';
import i18n from './i18n/index.js';
import './styles/main.css';
import './styles/themes/dark.css';
import './styles/themes/light.css';

// Import views
import LoginView from './views/LoginView.vue';
import LobbyView from './views/LobbyView.vue';
import GameView from './views/GameView.vue';
import ReportView from './views/ReportView.vue';
import ProfileView from './views/ProfileView.vue';
import FriendsView from './views/FriendsView.vue';
import GameLobby from './views/GameLobby.vue';
import PokerGame from './views/PokerGame.vue';

// Create router
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
    { path: '/lobby', name: 'Lobby', component: LobbyView, meta: { requiresAuth: true } },
    { path: '/game', name: 'Game', component: GameView, meta: { requiresAuth: true } },
    { path: '/report', name: 'Report', component: ReportView, meta: { requiresAuth: true } },
    { path: '/profile', name: 'Profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/friends', name: 'Friends', component: FriendsView, meta: { requiresAuth: true } },
    { path: '/poker-lobby', name: 'GameLobby', component: GameLobby, meta: { requiresAuth: true } },
    { path: '/poker-game/:gameId', name: 'PokerGame', component: PokerGame, meta: { requiresAuth: true } }
  ]
});

// Create and mount app first
const app = createApp(App);

app.use(pinia);
app.use(i18n);
app.use(router);

app.mount('#app');

// 強制移除所有 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      console.log('正在移除殘留的 Service Worker:', registration);
      registration.unregister(); // <--- 關鍵是這個 unregister (取消註冊)
    }
    // 如果發現有殘留並移除了，重新整理頁面確保乾淨
    if (registrations.length > 0) {
      window.location.reload();
    }
  });
}
