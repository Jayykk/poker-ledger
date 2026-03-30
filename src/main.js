import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import pinia from './store/index.js';
import i18n from './i18n/index.js';
import { useLiff } from './composables/useLiff.js';
import './styles/main.css';
import './styles/themes/dark.css';
import './styles/themes/light.css';

// ── LIFF deep-link → hash-route redirect ────────────────────────────
// GitHub Pages doesn't support SPA rewrites. When LINE opens a LIFF URL
// like liff.line.me/ID/game/abc123, GitHub Pages returns 404.html which
// redirects to /poker-ledger/?__path=game/abc123. We pick that up here
// and convert it into a proper hash route: /poker-ledger/#/game/abc123.
// Also handles the direct-pathname case (e.g. Firebase Hosting).
(function liffPathRedirect() {
  const base = import.meta.env.BASE_URL || '/'; // '/poker-ledger/'
  const { pathname, search, hash } = window.location;

  // Case 1: Redirected via 404.html with ?__path= query param
  const params = new URLSearchParams(search);
  const pathFromQuery = params.get('__path');
  if (pathFromQuery) {
    params.delete('__path');
    const remaining = params.toString();
    const qs = remaining ? `?${remaining}` : '';
    window.location.replace(`${base}${qs}#/${pathFromQuery}`);
    throw new Error('LIFF_REDIRECT');
  }

  // Case 2: Direct pathname (e.g. Firebase Hosting rewrite to index.html)
  if (pathname.startsWith(base) && pathname !== base) {
    const subPath = pathname.slice(base.length).replace(/^\/+/, '');
    if (subPath && !hash) {
      window.location.replace(`${base}#/${subPath}${search}`);
      throw new Error('LIFF_REDIRECT');
    }
  }
})();

// Import views
import LoginView from './views/LoginView.vue';
import LobbyView from './views/LobbyView.vue';
import GameView from './views/GameView.vue';
import ReportView from './views/ReportView.vue';
import ProfileView from './views/ProfileView.vue';
import FriendsView from './views/FriendsView.vue';
import GameLobby from './views/GameLobby.vue';
import PokerGame from './views/PokerGame.vue';

// ── Async bootstrap ─────────────────────────────────────────────────
// Must be async so we can await LIFF token processing BEFORE Vue Router
// reads the hash. Without this, LIFF auth callback tokens in the hash
// (#/access_token=...) get interpreted as a Vue route and break routing.
(async function bootstrap() {
  const { initLiff } = useLiff();

  // LIFF external-browser auth callback: LINE puts tokens in the hash.
  // We must let LIFF SDK process them BEFORE creating the router,
  // otherwise Vue Router sees "#/access_token=..." as a route path.
  if (/[#&]access_token=/.test(window.location.hash)) {
    console.log('[LIFF] Auth tokens detected in hash, processing...');
    try {
      await initLiff();
    } catch (e) {
      console.error('[LIFF] Token processing failed:', e);
    }
    // LIFF has read the tokens. Clean the hash for Vue Router.
    history.replaceState(null, '',
      window.location.pathname + window.location.search + '#/');
  }

  // Create router (hash is now clean)
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
      if (to.params.gameId) {
        sessionStorage.setItem('liff_redirect', to.fullPath);
      }
    }
    next();
  });

  // Create and mount app
  const app = createApp(App);

  app.use(pinia);
  app.use(i18n);
  app.use(router);

  app.mount('#app');

  // Initialize LIFF for non-callback cases (skips if already done above)
  initLiff().catch(() => {});
})();
