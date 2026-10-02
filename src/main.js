import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import pinia from './store/index.js';
import i18n from './i18n/index.js';
import { useLiff } from './composables/useLiff.js';
import { useNotificationStore } from './store/modules/notification.js';
import './styles/main.css';
import './styles/themes/dark.css';
import './styles/themes/light.css';
import { buildThemeCss, applyTheme } from './utils/themes.js';
import { reportError } from './utils/errorReport.js';
import { STORAGE_KEYS as THEME_STORAGE_KEYS } from './utils/constants.js';

// ── Color themes: every theme's variables, then the saved choice ─────
{
  const style = document.createElement('style');
  style.id = 'app-themes';
  style.textContent = buildThemeCss();
  document.head.appendChild(style);
  let saved = null;
  try { saved = localStorage.getItem(THEME_STORAGE_KEYS.THEME); } catch { /* private mode */ }
  applyTheme(saved);
}

// ── Service Worker registration with update detection ────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        import.meta.env.BASE_URL + 'sw.js'
      );
      // Check for updates every 5 minutes
      setInterval(() => reg.update(), 5 * 60 * 1000);

      // Reload only after the user ACCEPTS the update. The old flow reloaded
      // on every controllerchange, which — combined with sw.js's former
      // skipWaiting + clients.claim — force-refreshed every open client the
      // moment a deploy landed (the "screen flashes after release" bug).
      let updateAccepted = false;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!updateAccepted || refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      const promptUpdate = (waitingWorker) => {
        if (!waitingWorker) return;
        // Prompt via the app's shared action notification (Pinia is active
        // by the time an update lands post-mount).
        try {
          useNotificationStore().addActionNotification({
            type: 'custom',
            title: '有新版本可用',
            message: '是否立即更新？',
            onConfirm: () => {
              updateAccepted = true;
              waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            },
          });
        } catch (e) {
          console.error('[SW] Update prompt failed:', e);
        }
      };

      // An update may already be waiting from a previous visit.
      promptUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // 'installed' with an existing controller = an update is waiting
          // for consent (without a controller it's the very first install).
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptUpdate(newWorker);
          }
        });
      });
    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  });
}

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
    // Query params must be INSIDE the hash for Vue Router (hash history) to read them
    window.location.replace(`${base}#/${pathFromQuery}${qs}`);
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
import DailyReportView from './views/DailyReportView.vue';
import TournamentClockView from './views/TournamentClockView.vue';
import BlindStructuresView from './views/BlindStructuresView.vue';
import BlindStructureSetupView from './views/BlindStructureSetupView.vue';
import TableTemplatesView from './views/TableTemplatesView.vue';
import TableTemplateSetupView from './views/TableTemplateSetupView.vue';
import MysteryDrawView from './views/MysteryDrawView.vue';
import TimeBankView from './views/TimeBankView.vue';
import DealerClockView from './views/DealerClockView.vue';
import DealerClockDemoView from './views/DealerClockDemoView.vue';
import TournamentGameView from './views/TournamentGameView.vue';
import SessionView from './views/SessionView.vue';
import SessionSetupView from './views/SessionSetupView.vue';
import SessionHistoryView from './views/SessionHistoryView.vue';
import TableManagementView from './views/admin/TableManagementView.vue';
import CashTableEditView from './views/admin/CashTableEditView.vue';
import TournamentEditView from './views/admin/TournamentEditView.vue';
import { logger } from "./utils/logger.js";

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
    logger.debug('[LIFF] Auth tokens detected in hash, processing...');
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
    // Without this the window keeps the previous page's scroll offset: e.g.
    // opening 限時賽設定 from the lobby's Tools section (bottom of the page)
    // landed the form scrolled past its first field. New pages start at the
    // top; back / forward restores where you were.
    scrollBehavior(to, from, savedPosition) {
      return savedPosition || { top: 0 };
    },
    routes: [
      { path: '/', redirect: '/login' },
      { path: '/login', name: 'Login', component: LoginView, meta: { requiresAuth: false } },
      { path: '/lobby', name: 'Lobby', component: LobbyView, meta: { requiresAuth: true } },
      { path: '/game', name: 'Game', component: GameView, meta: { requiresAuth: true } },
      { path: '/game/:gameId', name: 'GameDirect', component: GameView, meta: { requiresAuth: true } },
      { path: '/report', name: 'Report', component: ReportView, meta: { requiresAuth: true } },
      { path: '/report/:gameId', name: 'ReportDetail', component: ReportView, meta: { requiresAuth: true } },
      { path: '/daily-report', name: 'DailyReport', component: DailyReportView, meta: { requiresAuth: true } },
      { path: '/profile', name: 'Profile', component: ProfileView, meta: { requiresAuth: true } },
      { path: '/friends', name: 'Friends', component: FriendsView, meta: { requiresAuth: true } },
      { path: '/poker-lobby', name: 'GameLobby', component: GameLobby, meta: { requiresAuth: true } },
      { path: '/poker-game/:gameId', name: 'PokerGame', component: PokerGame, meta: { requiresAuth: true } },
      // 賽制設定 = blind-structure library; 開桌範本 = table templates
      { path: '/structures', name: 'BlindStructures', component: BlindStructuresView, meta: { requiresAuth: true } },
      { path: '/structure-setup', name: 'StructureSetup', component: BlindStructureSetupView, meta: { requiresAuth: true } },
      { path: '/structure-setup/:structureId', name: 'StructureSetupEdit', component: BlindStructureSetupView, meta: { requiresAuth: true } },
      { path: '/templates', name: 'TableTemplates', component: TableTemplatesView, meta: { requiresAuth: true } },
      { path: '/template-setup', name: 'TemplateSetup', component: TableTemplateSetupView, meta: { requiresAuth: true } },
      { path: '/template-setup/:templateId', name: 'TemplateSetupEdit', component: TableTemplateSetupView, meta: { requiresAuth: true } },
      // 神秘賞金抽獎 (from the room or the clock, any time)
      { path: '/mystery-draw/:gameId', name: 'MysteryDraw', component: MysteryDrawView, meta: { requiresAuth: true } },
      // Old preset pages (bookmarks, shared 賽制 links) → their new homes
      { path: '/tournament-presets', redirect: '/structures' },
      {
        path: '/tournament-setup',
        redirect: (to) => {
          if (to.query.preset) return { path: '/template-setup', query: { kind: 'tournament', preset: to.query.preset } };
          if (to.query.template) return { path: '/template-setup', query: { kind: 'tournament', builtin: `builtin:${to.query.template}` } };
          return '/structure-setup';
        },
      },
      { path: '/tournament-setup/:presetId', redirect: (to) => ({ path: `/structure-setup/${to.params.presetId}`, query: { source: 'tournamentPresets' } }) },
      { path: '/cash-presets', redirect: { path: '/templates', query: { kind: 'cash' } } },
      { path: '/cash-preset-setup', redirect: { path: '/template-setup', query: { kind: 'cash' } } },
      { path: '/cash-preset-setup/:presetId', redirect: (to) => ({ path: `/template-setup/${to.params.presetId}`, query: { source: 'cashPresets' } }) },
      { path: '/tournament-clock/:sessionId', name: 'TournamentClock', component: TournamentClockView, meta: { requiresAuth: true } },
      { path: '/time-bank/:sessionId', name: 'TimeBank', component: TimeBankView, meta: { requiresAuth: true } },
      { path: '/tournament-game', name: 'TournamentGame', component: TournamentGameView, meta: { requiresAuth: true } },
      { path: '/tournament-game/:gameId', name: 'TournamentGameDirect', component: TournamentGameView, meta: { requiresAuth: true } },
      { path: '/dealer-clock-demo', name: 'DealerClockDemo', component: DealerClockDemoView, meta: { requiresAuth: false } },
      { path: '/dealer-clock/:sessionId', name: 'DealerClock', component: DealerClockView, meta: { requiresAuth: false } },
      { path: '/session-setup', name: 'SessionSetup', component: SessionSetupView, meta: { requiresAuth: true } },
      { path: '/session-setup/:sessionId', name: 'SessionSetupEdit', component: SessionSetupView, meta: { requiresAuth: true } },
      { path: '/session/:sessionId', name: 'Session', component: SessionView, meta: { requiresAuth: true } },
      { path: '/session-history', name: 'SessionHistory', component: SessionHistoryView, meta: { requiresAuth: true } },
      { path: '/admin/tables', name: 'AdminTables', component: TableManagementView, meta: { requiresAuth: true } },
      { path: '/admin/cash/:gameId', name: 'AdminCashEdit', component: CashTableEditView, meta: { requiresAuth: true } },
      { path: '/admin/tournament/:sessionId', name: 'AdminTournamentEdit', component: TournamentEditView, meta: { requiresAuth: true } }
    ]
  });

  // Navigation guard: store intended path for post-login redirect
  router.beforeEach((to, from, next) => {
    if (to.meta.requiresAuth !== false && to.path !== '/login') {
      if (to.params.gameId || to.params.sessionId) {
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

  // ── Global error handling ─────────────────────────────────────────
  // Render/lifecycle errors and unhandled promise rejections previously
  // vanished into the console; surface them with a toast so users aren't
  // stuck on a silently-broken screen, and keep the full error in the log.
  const reportGlobalError = (err, context) => {
    logger.error(`[global:${context}]`, err);
    reportError(err, context);
    try {
      useNotificationStore().error(
        i18n.global.t('common.unexpectedError'),
        5000
      );
    } catch (notifyErr) {
      // Pinia/notification not ready (very early failure) — log only.
      logger.error('[global] toast failed:', notifyErr);
    }
  };

  app.config.errorHandler = (err, _instance, info) => {
    reportGlobalError(err, `vue:${info}`);
  };

  window.addEventListener('unhandledrejection', (event) => {
    reportGlobalError(event.reason, 'unhandledrejection');
  });

  // Errors outside Vue (e.g. inside a library's animation frame) — reported
  // without a toast, the screen usually keeps working
  window.addEventListener('error', (event) => {
    if (event.error || event.message) reportError(event.error || event.message, 'window:error');
  });

  app.mount('#app');

  // Initialize LIFF for non-callback cases (skips if already done above)
  initLiff().catch(() => {});
})();
