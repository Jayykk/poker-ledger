import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import pinia from './store/index.js';
import i18n from './i18n/index.js';
import { useLiff } from './composables/useLiff.js';
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
    { path: '/game/:gameId', name: 'GameDirect', component: GameView, meta: { requiresAuth: true } },
    { path: '/report', name: 'Report', component: ReportView, meta: { requiresAuth: true } },
    { path: '/profile', name: 'Profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/friends', name: 'Friends', component: FriendsView, meta: { requiresAuth: true } },
    { path: '/poker-lobby', name: 'GameLobby', component: GameLobby, meta: { requiresAuth: true } },
    { path: '/poker-game/:gameId', name: 'PokerGame', component: PokerGame, meta: { requiresAuth: true } }
  ]
});

// Navigation guard: store intended path for post-login redirect
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth !== false && to.path !== '/login') {
    // Save deep link target so App.vue can redirect after auth
    if (to.params.gameId) {
      sessionStorage.setItem('liff_redirect', to.fullPath);
    }
  }
  next();
});

// Create and mount app first
const app = createApp(App);

app.use(pinia);
app.use(i18n);
app.use(router);

app.mount('#app');

// Initialize LIFF (non-blocking – will silently fail if no LIFF_ID configured)
const { initLiff } = useLiff();
initLiff().catch(() => {});
