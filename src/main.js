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
    { path: '/friends', name: 'Friends', component: FriendsView, meta: { requiresAuth: true } }
  ]
});

// Create and mount app first
const app = createApp(App);

app.use(pinia);
app.use(i18n);
app.use(router);

app.mount('#app');

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/poker-ledger/sw.js')
      .then(registration => console.log('SW registered:', registration))
      .catch(err => console.log('SW registration failed:', err));
  });
}
