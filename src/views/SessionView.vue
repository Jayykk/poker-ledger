<template>
  <div class="session-view">
    <div v-if="loading && !session" class="state-msg">{{ t('loading') }}</div>
    <div v-else-if="!session" class="state-msg">{{ t('session.ended') }}</div>

    <!-- Came from the "table is live" card (?enter=1): on the way to the table -->
    <div v-else-if="entering" class="state-msg">{{ t('session.redirecting') }}</div>

    <div v-else class="sv-page">
      <header class="sv-head">
        <div class="sv-title">
          <h1>{{ session.name }}</h1>
          <span class="status-pill" :class="session.status">{{ statusLabel }}</span>
        </div>
        <div class="sv-meta">
          <span class="meta-chip"><i class="far fa-calendar" aria-hidden="true"></i>{{ formatDateTime(session.dateTimeMs) }}</span>
          <span v-if="showLocation" class="meta-chip"><i class="fas fa-location-dot" aria-hidden="true"></i>{{ session.location.name }}</span>
        </div>
      </header>

      <!-- What is running now, and the way into it. Nobody is sent to the
           table from here on their own: this page is also where 代墊分帳 and
           the sign-ups live, and has to stay reachable while a table runs. -->
      <section v-if="session.status === 'active'" class="sv-live" :class="{ idle: !liveLabel }" data-test="live">
        <div class="live-text">
          <span class="live-dot" aria-hidden="true"></span>
          <span v-if="liveLabel" class="live-label">{{ t('session.statusActive') }} · {{ liveLabel }}</span>
          <span v-else class="live-label">{{ t('session.noActivePeriod') }}</span>
        </div>
        <p v-if="canEnter && !isHostView" class="live-hint">{{ t('session.tableOpen') }}</p>
        <button v-if="canEnter" type="button" class="btn primary block" data-test="enter-table" @click="enterTable">
          <i class="fas fa-right-to-bracket" aria-hidden="true"></i><span>{{ t('session.enterTable') }}</span>
        </button>
      </section>

      <!-- Completed: summary -->
      <section v-if="view.mode === 'completed'" class="sv-card summary">
        <h3>{{ t('session.summary') }}</h3>
        <div v-if="!summary" class="muted">{{ t('loading') }}</div>
        <template v-else-if="summary.tableCount > 0 || expenseRows.length">
          <!-- 總和 / 牌局 / 代墊, once anyone logged an expense -->
          <div v-if="expenseRows.length" class="summary-tabs" role="tablist">
            <button
              v-for="tab in SUMMARY_TABS"
              :key="tab"
              type="button"
              role="tab"
              :aria-selected="summaryTab === tab"
              :class="{ on: summaryTab === tab }"
              @click="summaryTab = tab"
            >
              {{ t(`expense.tabs.${tab}`) }}
            </button>
          </div>

          <template v-if="summaryTab === 'total' && expenseRows.length">
            <p class="muted tab-hint">{{ t('expense.totalHint') }}</p>
            <ol class="rank-list">
              <li v-for="r in totalRows" :key="r.key">
                <span class="rank-name">
                  {{ r.name }}
                  <span class="rank-sub">{{ t('expense.tabs.poker') }} {{ signed(r.poker) }} · {{ t('expense.tabs.expense') }} {{ signed(r.expense) }}</span>
                </span>
                <span class="rank-profit" :class="r.total >= 0 ? 'pos' : 'neg'">{{ signed(r.total) }}</span>
              </li>
            </ol>
          </template>

          <template v-else-if="summaryTab === 'expense' && expenseRows.length">
            <p class="muted tab-hint">{{ t('expense.netHint') }}</p>
            <ol class="rank-list">
              <li v-for="r in expenseRows" :key="r.uid">
                <span class="rank-name">{{ r.name }}</span>
                <span class="rank-profit" :class="r.net >= 0 ? 'pos' : 'neg'">{{ r.net >= 0 ? '+' : '' }}{{ r.net }}</span>
              </li>
            </ol>
          </template>

          <template v-else-if="summary.tableCount > 0">
            <div class="summary-totals">
              <div><span>{{ t('session.summaryTables') }}</span><strong>{{ summary.tableCount }}</strong></div>
              <div><span>{{ t('session.summaryTotalBuyIn') }}</span><strong>{{ Math.round(summary.totalBuyIn) }}</strong></div>
            </div>
            <h4>{{ t('session.ranking') }}</h4>
            <ol class="rank-list">
              <li v-for="(p, i) in summary.ranking" :key="p.odId || p.name || i">
                <span class="rank-medal">{{ medal(i) }}</span>
                <span class="rank-name">{{ p.name }}</span>
                <span class="rank-profit" :class="p.profitCash >= 0 ? 'pos' : 'neg'">
                  {{ p.profitCash >= 0 ? '+' : '' }}{{ formatCashTotal(p.profitCash, summary.cashDecimals) }}
                </span>
              </li>
            </ol>
          </template>
          <div v-else class="muted">{{ t('session.noSettlement') }}</div>
          <button type="button" class="btn ghost block full-w" @click="onShareSummary">
            <i class="fas fa-share-nodes" aria-hidden="true"></i><span>{{ t('session.shareSummary') }}</span>
          </button>
        </template>
        <div v-else class="muted">{{ t('session.noSettlement') }}</div>
      </section>

      <!-- Period board (sign-up + per-period rosters) -->
      <section class="sv-card periods">
        <h3>{{ t('session.periods') }}</h3>
        <component
          :is="pickable(p) ? 'label' : 'div'"
          v-for="p in (session.periods || [])"
          :key="p.id"
          class="period-card"
          :class="[p.status, { pickable: pickable(p), picked: selectedPeriodIds.includes(p.id) }]"
        >
          <div class="p-head">
            <input
              v-if="pickable(p)"
              type="checkbox"
              class="p-check"
              :value="p.id"
              v-model="selectedPeriodIds"
              :disabled="!canTogglePeriod(p)"
            />
            <span class="kind">{{ typeLabel(p.type) }}</span>
            <span class="p-label">{{ p.label || '—' }}</span>
            <span class="p-count" :class="{ full: periodFull(p) }">{{ periodCount(p) }}/{{ p.maxPlayers }}</span>
          </div>
          <div class="p-sub">
            <span class="p-status" :class="p.status">{{ statusText(p.status) }}</span>
            <span v-if="iAmIn(p)" class="p-mine"><i class="fas fa-check" aria-hidden="true"></i>{{ t('session.signedUp') }}</span>
          </div>
          <ul v-if="(p.roster || []).length" class="p-roster">
            <li v-for="(r, i) in p.roster" :key="r.uid || i" :class="{ me: r.uid === uid }">{{ r.name }}</li>
          </ul>
        </component>

        <!-- Sign-up: the host takes part too, so both see it while a period is still open -->
        <div v-if="canPick && (view.mode === 'rsvp' || hasQueuedPeriod)" class="signup">
          <p v-if="view.mode === 'host-console'" class="muted signup-hint">{{ t('session.mySignUp') }}</p>
          <div class="btn-row">
            <button type="button" class="btn primary" :disabled="joinDisabled || rsvpBusy" @click="onJoin">
              <span>{{ amJoined ? t('common.save') : t('session.signUpPeriods') }}</span>
            </button>
            <button v-if="amJoined" type="button" class="btn danger-outline" :disabled="rsvpBusy" @click="onCancel">
              <span>{{ t('session.cancelRsvp') }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Shared expenses (代墊分帳): players of the event and the host -->
      <EventExpenses
        v-if="canSeeExpenses"
        class="sv-card"
        :session-id="route.params.sessionId"
        :expenses="expenses"
        :people="people"
        :is-host="isHostView"
      />

      <!-- Host console -->
      <section v-if="view.mode === 'host-console'" class="sv-card console">
        <h3>{{ t('session.manage') }}</h3>
        <button v-if="session.status === 'scheduling'" type="button" class="btn primary block" @click="onStart">
          <i class="fas fa-play" aria-hidden="true"></i><span>{{ t('session.startEvent') }}</span>
        </button>
        <button v-if="canStartNext" type="button" class="btn primary block" @click="onStartNext">
          <i class="fas fa-forward-step" aria-hidden="true"></i><span>{{ t('session.startNextPeriod') }}</span>
        </button>
        <div class="btn-grid">
          <button type="button" class="btn ghost" @click="onEdit">
            <i class="fas fa-pen" aria-hidden="true"></i><span>{{ t('session.modifyPeriods') }}</span>
          </button>
          <button type="button" class="btn ghost" @click="onShareInvite">
            <i class="fas fa-share-nodes" aria-hidden="true"></i><span>{{ t('session.shareInvite') }}</span>
          </button>
          <button v-if="session.status === 'active' && session.activeSlot && view.route" type="button" class="btn ghost" @click="onShareTable">
            <i class="fas fa-chair" aria-hidden="true"></i><span>{{ t('session.shareTable') }}</span>
          </button>
        </div>
        <!-- Ends or removes the event: set apart, and never next to the everyday buttons -->
        <div class="btn-grid danger-zone">
          <button v-if="session.status === 'active'" type="button" class="btn danger-outline" @click="onEnd">
            <i class="fas fa-flag-checkered" aria-hidden="true"></i><span>{{ t('session.endEvent') }}</span>
          </button>
          <button type="button" class="btn danger-text" @click="onDelete">
            <i class="fas fa-trash" aria-hidden="true"></i><span>{{ t('session.deleteEvent') }}</span>
          </button>
        </div>
      </section>

      <p v-if="notice" class="notice">{{ notice }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../store/modules/auth.js';
import { useSessions } from '../composables/useSessions.js';
import { useLiff } from '../composables/useLiff.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLoading } from '../composables/useLoading.js';
import {
  resolveSessionView, canViewLocation, isParticipant,
  periodCount, periodFull, canJoinPeriod, isSignedUpForPeriod,
} from '../utils/sessionFlow.js';
import { markSessionReturn } from '../utils/sessionReturn.js';
import { formatCashTotal } from '../utils/cashRounding.js';
import { eventPeople, aggregateExpenses, combineEventTotals } from '../utils/eventExpenses.js';
import { useEventExpenses, deleteEventExpenses } from '../composables/useEventExpenses.js';
import EventExpenses from '../components/session/EventExpenses.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { withLoading } = useLoading();
const authStore = useAuthStore();
const {
  session, loading, listenSession, getSession,
  rsvp, cancelRsvp, activateFirstTable, advanceToNextTable, endSession, deleteSession, loadSessionSummary,
  listenGameStatus, isGameLive, hasNextSlot,
} = useSessions();
const { shareSessionInvite, sendSessionRsvpMessage, shareSessionTableCard, shareSessionSummary } = useLiff();
const { confirm } = useConfirm();
const { expenses, listen: listenExpenses, stop: stopExpenses } = useEventExpenses();

const uid = computed(() => authStore.user?.uid || null);
const summary = ref(null);
const notice = ref('');
const selectedPeriodIds = ref([]);
let pickInit = false;

// What this visitor gets (sessionFlow.js): the summary, the host console or
// the sign-up board; `view.route` is their table when one is running.
const view = computed(() => resolveSessionView(session.value, uid.value));
// The active table as last checked: 'live' | 'gone'. Auto-advance only runs
// while the host has this page open, so activeSlot can go stale and point at
// a settled game; entering that would bounce off the table back to the lobby.
const tableState = ref({ gameId: null, state: null });
const tableGone = computed(() => {
  const gameId = session.value?.activeSlot?.gameId;
  return !!gameId && tableState.value.gameId === gameId && tableState.value.state === 'gone';
});
// The way into the running table: the host always (their console advances a
// finished one), a member of the active period once it is known to be live
const canEnter = computed(() => {
  if (session.value?.status !== 'active' || !view.value.route) return false;
  if (view.value.mode === 'host-console') return true;
  const gameId = session.value?.activeSlot?.gameId;
  return tableState.value.gameId === gameId && tableState.value.state === 'live';
});
// Opened from the "table is live" card (?enter=1): go straight in, once
const wantsEnter = route.query?.enter === '1';
const entering = ref(false);
const amJoined = computed(() => isParticipant(session.value, uid.value));
const showLocation = computed(() => canViewLocation(session.value));
const canStartNext = computed(() => !!session.value && session.value.status === 'active'
  && (!session.value.activeSlot || session.value.activeSlot.type === 'custom') && hasNextSlot(session.value));
const joinDisabled = computed(() => !amJoined.value && selectedPeriodIds.value.length === 0);
// The host participates by default and manages their own sign-ups from the
// console, so the period picker + RSVP CTA show for both RSVP and host views.
const canPick = computed(() => view.value.mode === 'rsvp' || view.value.mode === 'host-console');
// Expenses are readable by the event's players and its host (firestore.rules).
const isHostView = computed(() => !!session.value && session.value.hostUid === uid.value);
const canSeeExpenses = computed(() => isHostView.value || amJoined.value);
const people = computed(() => eventPeople(session.value));
const expenseRows = computed(() => aggregateExpenses(expenses.value));
const totalRows = computed(() => combineEventTotals(summary.value?.ranking || [], expenseRows.value));
const SUMMARY_TABS = ['total', 'poker', 'expense'];
const summaryTab = ref('total');
const signed = (n) => `${n >= 0 ? '+' : ''}${formatCashTotal(n, summary.value?.cashDecimals)}`;
const hasQueuedPeriod = computed(() => (session.value?.periods || []).some((p) => p.status === 'queued'));

// What is running, '' when nothing is (no activeSlot, or a finished table)
const liveLabel = computed(() => {
  const at = session.value?.activeSlot;
  if (!at || tableGone.value) return '';
  const p = (session.value?.periods || []).find((e) => e.id === at.id);
  return p ? `${typeLabel(p.type)} · ${p.label || ''}` : '';
});

const statusLabel = computed(() => {
  switch (session.value?.status) {
  case 'scheduling': return t('session.queued');
  case 'active': return t('session.statusActive');
  case 'completed': return t('session.done');
  default: return '';
  }
});

function typeLabel(type) {
  if (type === 'tournament') return t('session.tournament');
  if (type === 'custom') return t('session.custom');
  return t('session.cash');
}
function statusText(s) {
  if (s === 'active') return t('session.statusActive');
  if (s === 'done') return t('session.done');
  return t('session.queued');
}
// A period this visitor can still tick
function pickable(p) {
  return canPick.value && p.status === 'queued';
}
function iAmIn(p) {
  return isSignedUpForPeriod(session.value, uid.value, p.id);
}
function canTogglePeriod(p) {
  return canJoinPeriod(p, uid.value);
}
function medal(i) { return ['🥇', '🥈', '🥉'][i] || `${i + 1}.`; }
function formatDateTime(ms) {
  const d = new Date(Number(ms) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function withNotice(fn) {
  notice.value = '';
  try { await fn(); } catch (err) {
    console.error('[SessionView] action failed:', err);
    notice.value = err?.message || t('session.actionFailed');
  }
}

// Server-heavy actions (starting a table is several round trips, deleting
// walks every expense): the global spinner, and one at a time so a double
// tap can't open two tables
const actionBusy = ref(false);
async function withBusy(fn, text) {
  if (actionBusy.value) return;
  actionBusy.value = true;
  try { await withNotice(() => withLoading(fn, text)); }
  finally { actionBusy.value = false; }
}

// In-flight guard: while an RSVP write is processing, ignore further taps so
// spam-clicking can't fire concurrent transactions / duplicate roster cards.
const rsvpBusy = ref(false);
async function withRsvp(fn) {
  if (rsvpBusy.value) return;
  rsvpBusy.value = true;
  notice.value = '';
  try { await fn(); }
  catch (err) { notice.value = err?.message || t('session.actionFailed'); }
  finally { rsvpBusy.value = false; }
}

// Only post the roster card when the sign-up actually changed (the transaction
// is idempotent and reports `changed`).
const onJoin = () => withRsvp(async () => {
  const res = await rsvp(route.params.sessionId, [...selectedPeriodIds.value]);
  if (res?.changed) sendSessionRsvpMessage(res, authStore.displayName);
});
const onCancel = () => withRsvp(async () => {
  const res = await cancelRsvp(route.params.sessionId);
  if (res?.changed) sendSessionRsvpMessage(res, authStore.displayName, { cancelled: true });
});
const onStart = () => withBusy(() => activateFirstTable(route.params.sessionId), t('loading.saving'));
const onStartNext = () => withBusy(() => advanceToNextTable(route.params.sessionId), t('loading.saving'));
const onEnd = async () => {
  if (!await confirm({ message: t('session.confirmEnd'), type: 'warning' })) return;
  await withBusy(() => endSession(route.params.sessionId), t('loading.saving'));
};
const onDelete = async () => {
  if (!await confirm({ message: t('session.confirmDelete'), type: 'danger' })) return;
  await withBusy(async () => {
    // Expenses first: their rules read the session doc
    await deleteEventExpenses(route.params.sessionId);
    await deleteSession(route.params.sessionId);
    router.push('/lobby');
  }, t('loading.removing'));
};
const onEdit = () => router.push(`/session-setup/${route.params.sessionId}`);
const enterTable = () => {
  if (!view.value.route) return;
  markSessionReturn(route.params.sessionId, session.value?.activeSlot?.gameId);
  router.push(view.value.route);
};

const onShareInvite = () => withNotice(() => shareSessionInvite(session.value));
const onShareTable = () => withNotice(() => shareSessionTableCard(session.value));
// The card carries every tab (總和 / 牌局 / 代墊), whichever one is on screen.
const onShareSummary = () => withNotice(() => shareSessionSummary(session.value, summary.value, expenses.value));

// Is the active table still running? Asked for every visitor but the host
// (whose console advances a finished one), also someone not at that table:
// their banner must not say 進行中 over a table that is over. Checked once per
// gameId, so the host advancing to the next table is checked again.
// Nobody is sent to the table from this page (it is also where the sign-ups
// and 代墊分帳 are), except someone who came from the "table is live" card.
watch(() => [view.value.mode, view.value.route, session.value?.activeSlot?.gameId], async ([mode, tableRoute, gameId]) => {
  if (mode !== 'rsvp' || !gameId || tableState.value.gameId === gameId) return;
  tableState.value = { gameId, state: null };
  const live = await isGameLive(gameId);
  if (session.value?.activeSlot?.gameId !== gameId) return;
  tableState.value = { gameId, state: live ? 'live' : 'gone' };
  if (live && tableRoute && wantsEnter && !entering.value) {
    entering.value = true;
    markSessionReturn(route.params.sessionId, gameId);
    // The page without ?enter stays behind in history: leaving the table
    // comes back here and stays
    await router.replace(`/session/${route.params.sessionId}`);
    router.push(tableRoute);
  }
}, { immediate: true });

// Load the cross-period summary once completed.
watch(() => session.value?.status, async (status) => {
  if (status === 'completed' && !summary.value) {
    summary.value = await loadSessionSummary(route.params.sessionId);
  }
}, { immediate: true });

// Initialise the period picker once: my queued sign-ups, else all joinable queued.
watch(session, (s) => {
  if (!s || pickInit || s.status === 'completed') return;
  const queued = (s.periods || []).filter((p) => p.status === 'queued');
  const mine = queued.filter((p) => (p.rosterUids || []).includes(uid.value)).map((p) => p.id);
  selectedPeriodIds.value = (mine.length || isParticipant(s, uid.value))
    ? mine
    : queued.filter((p) => canJoinPeriod(p, uid.value)).map((p) => p.id);
  pickInit = true;
}, { immediate: true });

// Host-side auto-advance: when the active period's table finishes (settle /
// dissolve), advance to the next period (or pause on a custom one).
let unsubGame = null;
let advancing = false;
watch(() => (view.value.mode === 'host-console' ? session.value?.activeSlot?.gameId : null), (gameId) => {
  if (unsubGame) { unsubGame(); unsubGame = null; }
  if (!gameId) return;
  unsubGame = listenGameStatus(gameId, async (status) => {
    if (advancing) return;
    const finished = ['completed', 'closed', 'cancelled', 'missing'].includes(status);
    if (finished && session.value?.status === 'active' && session.value?.activeSlot) {
      advancing = true;
      try { await advanceToNextTable(route.params.sessionId); }
      catch (err) { notice.value = err?.message || t('session.actionFailed'); }
      finally { advancing = false; }
    }
  });
}, { immediate: true });

// Only members may read expenses; start listening once we know we are one.
watch(canSeeExpenses, (ok) => {
  if (ok) listenExpenses(route.params.sessionId);
  else stopExpenses();
}, { immediate: true });

onMounted(() => { listenSession(route.params.sessionId); });
onUnmounted(() => { if (unsubGame) { unsubGame(); unsubGame = null; } });
</script>

<style scoped>
/* One column of cards, the same width as every other page. Every button is
   the one .btn: fixed height, icon + label, and a label that never spills
   out of it (a full-width button truncates, a grid button wraps inside its
   cell and the row keeps one height). */
.session-view {
  min-height: 100vh;
  background: linear-gradient(135deg, rgb(var(--tw-slate-900)) 0%, rgb(var(--tw-slate-800)) 100%);
  padding: 20px 16px calc(4rem + env(safe-area-inset-bottom, 0px) + 2rem);
  color: rgb(var(--tw-white));
}
.state-msg { max-width: 64rem; margin: 80px auto; text-align: center; color: rgb(var(--tw-white) / 0.7); font-size: 18px; }
.sv-page { width: 100%; max-width: 28rem; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 768px) { .sv-page { max-width: 48rem; } }
@media (min-width: 1024px) { .sv-page { max-width: 64rem; } }

.sv-head { padding: 4px 2px 2px; }
.sv-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.sv-title h1 { margin: 0; min-width: 0; font-size: 22px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.status-pill { flex: 0 0 auto; margin-top: 3px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; color: #fff; }
.status-pill.scheduling { background: rgb(var(--tw-emerald-600)); }
.status-pill.active { background: rgb(var(--tw-amber-500)); color: var(--on-accent, #fff); }
.status-pill.completed { background: rgb(var(--tw-slate-500)); }
.sv-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.meta-chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  padding: 4px 10px; border-radius: 999px; font-size: 13px;
  background: rgb(var(--tw-white) / 0.07); color: rgb(var(--tw-white) / 0.85);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meta-chip i { font-size: 12px; color: rgb(var(--tw-white) / 0.55); }

.sv-card {
  background: rgb(var(--tw-slate-800) / 0.7); border: 1px solid rgb(var(--tw-slate-700));
  border-radius: 16px; padding: 16px;
}
.sv-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 800; }
.sv-card h4 { margin: 12px 0 6px; font-size: 13px; font-weight: 700; color: rgb(var(--tw-white) / 0.7); }

.sv-live {
  padding: 14px 16px; border-radius: 16px;
  background: rgb(var(--tw-amber-500) / 0.14); border: 1px solid rgb(var(--tw-amber-500) / 0.45);
}
.sv-live.idle { background: rgb(var(--tw-white) / 0.05); border-color: rgb(var(--tw-white) / 0.14); }
.live-text { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 800; color: rgb(var(--tw-amber-200)); }
.sv-live.idle .live-text { color: rgb(var(--tw-white) / 0.6); font-weight: 600; }
.live-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.live-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 999px; background: rgb(var(--tw-rose-500)); box-shadow: 0 0 0 0 rgb(var(--tw-rose-500) / 0.6); animation: sv-pulse 1.8s ease-out infinite; }
.sv-live.idle .live-dot { background: rgb(var(--tw-white) / 0.35); animation: none; }
@keyframes sv-pulse { to { box-shadow: 0 0 0 9px rgb(var(--tw-rose-500) / 0); } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
.live-hint { margin: 6px 0 0; font-size: 12px; color: rgb(var(--tw-white) / 0.6); }
.sv-live .btn { margin-top: 12px; }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-width: 0; min-height: 44px; padding: 6px 14px;
  border: 1px solid transparent; border-radius: 12px;
  font-size: 14px; font-weight: 700; line-height: 1.2; text-align: center; cursor: pointer;
  transition: transform 0.1s, opacity 0.15s;
}
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn i { flex: 0 0 auto; font-size: 13px; }
.btn span { min-width: 0; overflow-wrap: anywhere; }
.btn.block { display: flex; width: 100%; }
.btn.block span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn.primary { background: rgb(var(--tw-emerald-600)); color: #fff; }
.btn.ghost { background: rgb(var(--tw-white) / 0.07); border-color: rgb(var(--tw-white) / 0.16); color: rgb(var(--tw-white)); }
.btn.danger-outline { background: rgb(var(--tw-rose-500) / 0.1); border-color: rgb(var(--tw-rose-400) / 0.5); color: rgb(var(--tw-rose-300)); }
.btn.danger-text { background: transparent; color: rgb(var(--tw-rose-300) / 0.9); }
/* Side by side, sharing the row evenly */
.btn-row { display: flex; gap: 8px; }
.btn-row > .btn { flex: 1 1 0; }
.btn-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.btn-grid > .btn:only-child { grid-column: 1 / -1; }
.console > .btn.block { margin-bottom: 8px; }
.danger-zone { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgb(var(--tw-white) / 0.08); }
.full-w { margin-top: 12px; }

/* ── Periods ── */
.period-card {
  display: block; padding: 12px; margin-bottom: 8px; border-radius: 12px;
  background: rgb(var(--tw-white) / 0.04); border: 1px solid rgb(var(--tw-white) / 0.1);
}
.period-card.pickable { cursor: pointer; }
.period-card.picked { border-color: rgb(var(--tw-emerald-500) / 0.6); background: rgb(var(--tw-emerald-500) / 0.08); }
.period-card.active { border-color: rgb(var(--tw-amber-500) / 0.55); }
.period-card.done { opacity: 0.6; }
.p-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.p-check { flex: 0 0 auto; width: 18px; height: 18px; accent-color: rgb(var(--tw-emerald-500)); }
.kind { flex: 0 0 auto; font-size: 11px; font-weight: 700; background: rgb(var(--tw-white) / 0.12); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.p-label { flex: 1 1 auto; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-count { flex: 0 0 auto; font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; color: rgb(var(--tw-emerald-400)); }
.p-count.full { color: rgb(var(--tw-rose-400)); }
.p-sub { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 12px; color: rgb(var(--tw-white) / 0.55); }
.p-status.active { color: rgb(var(--tw-amber-300)); font-weight: 700; }
.p-mine { display: inline-flex; align-items: center; gap: 4px; color: rgb(var(--tw-emerald-400)); font-weight: 700; }
.p-roster { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
.p-roster li { max-width: 100%; font-size: 12px; background: rgb(var(--tw-white) / 0.08); padding: 2px 9px; border-radius: 999px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-roster li.me { background: rgb(var(--tw-emerald-500) / 0.22); color: rgb(var(--tw-emerald-200)); font-weight: 700; }
.signup { margin-top: 12px; }
.signup-hint { margin: 0 0 8px; font-size: 12px; }

.muted { color: rgb(var(--tw-white) / 0.5); }

/* ── Summary ── */
.summary-totals { display: flex; gap: 8px; margin-bottom: 12px; }
.summary-totals div { flex: 1; min-width: 0; background: rgb(var(--tw-white) / 0.05); border-radius: 12px; padding: 10px; text-align: center; }
.summary-totals span { display: block; font-size: 12px; color: rgb(var(--tw-white) / 0.6); }
.summary-totals strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.rank-list { list-style: none; padding: 0; margin: 0; }
.rank-list li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgb(var(--tw-white) / 0.06); }
.rank-list li:last-child { border-bottom: none; }
.rank-medal { flex: 0 0 auto; width: 24px; text-align: center; }
.rank-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.rank-sub { display: block; font-size: 11px; color: rgb(var(--tw-white) / 0.45); }
.rank-profit { flex: 0 0 auto; font-weight: 800; font-variant-numeric: tabular-nums; }
.rank-profit.pos { color: rgb(var(--tw-emerald-400)); }
.rank-profit.neg { color: rgb(var(--tw-rose-400)); }
.summary-tabs { display: flex; gap: 4px; padding: 4px; margin-bottom: 10px; border-radius: 12px; background: rgb(var(--tw-white) / 0.06); }
.summary-tabs button { flex: 1; min-width: 0; padding: 8px 0; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; cursor: pointer; background: transparent; color: rgb(var(--tw-white) / 0.65); }
.summary-tabs button.on { background: rgb(var(--tw-amber-500)); color: var(--on-accent, white); }
.tab-hint { font-size: 12px; margin: 0 0 6px; }
.notice { margin: 4px 2px 0; color: rgb(var(--tw-amber-300)); font-size: 14px; }
</style>
