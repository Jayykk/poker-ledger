<template>
  <div class="session-view">
    <div v-if="loading && !session" class="state-msg">{{ t('loading') }}</div>
    <div v-else-if="!session" class="state-msg">{{ t('session.ended') }}</div>

    <!-- Redirecting a participant into their active table -->
    <div v-else-if="view.mode === 'redirect'" class="state-msg">{{ t('session.redirecting') }}</div>

    <div v-else class="card">
      <header class="head">
        <h1>{{ session.name }}</h1>
        <span class="status-pill" :class="session.status">{{ statusLabel }}</span>
      </header>

      <div class="meta">
        <div class="meta-row"><span>🗓️</span><span>{{ formatDateTime(session.dateTimeMs) }}</span></div>
        <div v-if="showLocation" class="meta-row"><span>📍</span><span>{{ session.location.name }}</span></div>
      </div>

      <!-- Active-period banner (someone in the event but not the running table) -->
      <div v-if="session.status === 'active' && activeLabel" class="active-banner">
        🔴 {{ t('session.statusActive') }} · {{ activeLabel }}
      </div>

      <!-- Period board (sign-up + per-period rosters) -->
      <section class="periods">
        <h3>{{ t('session.periods') }}</h3>
        <div
          v-for="p in (session.periods || [])"
          :key="p.id"
          class="period-card"
          :class="p.status"
        >
          <div class="p-head">
            <label class="p-pick">
              <input
                v-if="canPick && p.status === 'queued'"
                type="checkbox"
                :value="p.id"
                v-model="selectedPeriodIds"
                :disabled="!canTogglePeriod(p)"
              />
              <span class="kind">{{ typeLabel(p.type) }}</span>
              <span class="p-label">{{ p.label || '—' }}</span>
            </label>
            <span class="p-count" :class="{ full: periodFull(p) }">{{ periodCount(p) }}/{{ p.maxPlayers }}</span>
          </div>
          <div class="p-sub">
            <span class="p-status">{{ statusText(p.status) }}</span>
            <span v-if="iAmIn(p)" class="p-mine">✓</span>
          </div>
          <ul v-if="(p.roster || []).length" class="p-roster">
            <li v-for="(r, i) in p.roster" :key="r.uid || i">{{ r.name }}</li>
          </ul>
        </div>
      </section>

      <!-- RSVP actions (non-host) -->
      <div v-if="view.mode === 'rsvp'" class="cta">
        <button class="btn-primary" :disabled="joinDisabled" @click="onJoin">
          {{ amJoined ? t('common.save') : t('session.signUpPeriods') }}
        </button>
        <button v-if="amJoined" class="btn-danger" @click="onCancel">{{ t('session.cancelRsvp') }}</button>
      </div>

      <!-- Host console -->
      <div v-if="view.mode === 'host-console'" class="console">
        <!-- Host is a participant too: manage own sign-ups via the period picker above -->
        <div v-if="hasQueuedPeriod" class="host-rsvp">
          <span class="muted">{{ t('session.mySignUp') }}</span>
          <div class="host-rsvp-btns">
            <button class="btn-secondary" :disabled="joinDisabled" @click="onJoin">
              {{ amJoined ? t('common.save') : t('session.signUpPeriods') }}
            </button>
            <button v-if="amJoined" class="btn-danger" @click="onCancel">{{ t('session.cancelRsvp') }}</button>
          </div>
        </div>
        <div class="host-actions">
          <button v-if="session.status === 'scheduling'" class="btn-primary" @click="onStart">
            {{ t('session.startEvent') }}
          </button>
          <template v-if="session.status === 'active'">
            <button v-if="session.activeSlot && view.route" class="btn-secondary" @click="enterTable">
              {{ t('session.enterTable') }}
            </button>
            <p v-if="!session.activeSlot" class="muted">{{ t('session.noActivePeriod') }}</p>
            <button v-if="canStartNext" class="btn-primary" @click="onStartNext">
              {{ t('session.startNextPeriod') }}
            </button>
            <button class="btn-danger" @click="onEnd">{{ t('session.endEvent') }}</button>
          </template>
          <button class="btn-ghost" @click="onEdit">{{ t('session.modifyPeriods') }}</button>
          <button class="btn-ghost danger-text" @click="onDelete">🗑 {{ t('session.deleteEvent') }}</button>
        </div>
        <div class="share-actions">
          <button class="btn-ghost" @click="onShareInvite">📤 {{ t('session.shareInvite') }}</button>
          <button v-if="session.status === 'active' && session.activeSlot && view.route" class="btn-ghost" @click="onShareTable">
            🃏 {{ t('session.shareTable') }}
          </button>
        </div>
      </div>

      <!-- Completed: summary -->
      <section v-if="view.mode === 'completed'" class="summary">
        <h3>{{ t('session.summary') }}</h3>
        <div v-if="!summary" class="muted">{{ t('loading') }}</div>
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
                {{ p.profitCash >= 0 ? '+' : '' }}{{ Math.round(p.profitCash) }}
              </span>
            </li>
          </ol>
          <button class="btn-ghost full-w" @click="onShareSummary">📤 {{ t('session.shareSummary') }}</button>
        </template>
        <div v-else class="muted">{{ t('session.noSettlement') }}</div>
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
import {
  resolveSessionView, canViewLocation, isParticipant,
  periodCount, periodFull, canJoinPeriod, isSignedUpForPeriod,
} from '../utils/sessionFlow.js';
import { markSessionReturn } from '../utils/sessionReturn.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const {
  session, loading, listenSession, getSession,
  rsvp, cancelRsvp, activateFirstTable, advanceToNextTable, endSession, deleteSession, loadSessionSummary,
  listenGameStatus, hasNextSlot,
} = useSessions();
const { shareSessionInvite, sendSessionRsvpMessage, shareSessionTableCard, shareSessionSummary } = useLiff();
const { confirm } = useConfirm();

const uid = computed(() => authStore.user?.uid || null);
const summary = ref(null);
const notice = ref('');
const selectedPeriodIds = ref([]);
let redirected = false;
let pickInit = false;

const view = computed(() => resolveSessionView(session.value, uid.value));
const amJoined = computed(() => isParticipant(session.value, uid.value));
const showLocation = computed(() => canViewLocation(session.value));
const canStartNext = computed(() => !!session.value && session.value.status === 'active'
  && (!session.value.activeSlot || session.value.activeSlot.type === 'custom') && hasNextSlot(session.value));
const joinDisabled = computed(() => !amJoined.value && selectedPeriodIds.value.length === 0);
// The host participates by default and manages their own sign-ups from the
// console, so the period picker + RSVP CTA show for both RSVP and host views.
const canPick = computed(() => view.value.mode === 'rsvp' || view.value.mode === 'host-console');
const hasQueuedPeriod = computed(() => (session.value?.periods || []).some((p) => p.status === 'queued'));

const activeLabel = computed(() => {
  const at = session.value?.activeSlot;
  if (!at) return '';
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
  try { await fn(); } catch (err) { notice.value = err?.message || t('session.actionFailed'); }
}

const onJoin = () => withNotice(async () => {
  const fresh = await rsvp(route.params.sessionId, [...selectedPeriodIds.value]);
  if (fresh) sendSessionRsvpMessage(fresh, authStore.displayName);
});
const onCancel = () => withNotice(async () => {
  const fresh = await cancelRsvp(route.params.sessionId);
  if (fresh) sendSessionRsvpMessage(fresh, authStore.displayName, { cancelled: true });
});
const onStart = () => withNotice(() => activateFirstTable(route.params.sessionId));
const onStartNext = () => withNotice(() => advanceToNextTable(route.params.sessionId));
const onEnd = () => withNotice(async () => {
  if (!await confirm({ message: t('session.confirmEnd'), type: 'warning' })) return;
  await endSession(route.params.sessionId);
});
const onDelete = () => withNotice(async () => {
  if (!await confirm({ message: t('session.confirmDelete'), type: 'danger' })) return;
  await deleteSession(route.params.sessionId);
  router.push('/lobby');
});
const onEdit = () => router.push(`/session-setup/${route.params.sessionId}`);
const enterTable = () => {
  if (!view.value.route) return;
  markSessionReturn(route.params.sessionId, session.value?.activeSlot?.gameId);
  router.push(view.value.route);
};

const onShareInvite = () => withNotice(() => shareSessionInvite(session.value));
const onShareTable = () => withNotice(() => shareSessionTableCard(session.value));
const onShareSummary = () => withNotice(() => shareSessionSummary(session.value, summary.value));

// Redirect a participant into their active linked table.
watch(view, (v) => {
  if (v.mode === 'redirect' && v.route && !redirected) {
    redirected = true;
    markSessionReturn(route.params.sessionId, session.value?.activeSlot?.gameId);
    router.replace(v.route);
  }
}, { immediate: true });

// Load the cross-period summary once completed.
watch(() => session.value?.status, async (status) => {
  if (status === 'completed' && !summary.value) {
    summary.value = await loadSessionSummary(route.params.sessionId);
  }
});

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

onMounted(() => { listenSession(route.params.sessionId); });
onUnmounted(() => { if (unsubGame) { unsubGame(); unsubGame = null; } });
</script>

<style scoped>
.session-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 32px 16px 120px;
  color: white;
}
.state-msg { max-width: 560px; margin: 80px auto; text-align: center; color: rgba(255,255,255,0.7); font-size: 18px; }
.card {
  max-width: 560px; margin: 0 auto;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 24px;
}
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.head h1 { margin: 0; font-size: 24px; }
.status-pill { flex: 0 0 auto; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
.status-pill.scheduling { background: #2196F3; }
.status-pill.active { background: #ff9800; }
.status-pill.completed { background: #607d8b; }

.meta { margin: 16px 0; display: flex; flex-direction: column; gap: 8px; }
.meta-row { display: flex; gap: 10px; color: rgba(255,255,255,0.85); }

.active-banner {
  margin: 8px 0 16px; padding: 12px; border-radius: 10px;
  background: rgba(255,152,0,0.15); border: 1px solid rgba(255,152,0,0.4);
  color: #ffcc80; font-weight: bold;
}

.periods h3, .summary h3 {
  font-size: 16px; margin: 18px 0 10px;
  border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px;
}

.period-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 12px; margin-bottom: 10px;
}
.period-card.active { border-color: rgba(255,152,0,0.5); }
.period-card.done { opacity: 0.6; }
.p-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.p-pick { display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer; }
.p-pick input { width: 18px; height: 18px; }
.kind { font-size: 11px; background: rgba(255,255,255,0.12); padding: 2px 8px; border-radius: 10px; }
.p-label { font-weight: bold; }
.p-count { font-size: 14px; font-weight: bold; color: #1DB446; }
.p-count.full { color: #ff6b6b; }
.p-sub { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; color: rgba(255,255,255,0.55); }
.p-mine { color: #4caf50; }
.p-roster { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
.p-roster li { font-size: 12px; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 8px; }

.muted { color: rgba(255,255,255,0.45); }
.cta { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.console { margin-top: 12px; }
.host-actions, .share-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.host-rsvp {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px; margin-bottom: 4px;
  background: rgba(76,175,80,0.1); border: 1px solid rgba(76,175,80,0.3); border-radius: 10px;
}
.host-rsvp-btns { display: flex; gap: 8px; }
.host-rsvp-btns button { padding: 8px 14px; }

button { padding: 10px 16px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; }
.btn-primary { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; flex: 1; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; }
.btn-danger { background: #c0392b; color: white; }
.btn-ghost { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); }
.btn-ghost.danger-text { color: #ff8a80; border-color: rgba(255,107,107,0.4); }
.full-w { width: 100%; margin-top: 12px; }

.summary-totals { display: flex; gap: 16px; margin-bottom: 12px; }
.summary-totals div { flex: 1; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; text-align: center; }
.summary-totals span { display: block; font-size: 12px; color: rgba(255,255,255,0.6); }
.summary-totals strong { font-size: 20px; }
.rank-list { list-style: none; padding: 0; margin: 0; }
.rank-list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.rank-medal { width: 24px; }
.rank-name { flex: 1; }
.rank-profit.pos { color: #4caf50; font-weight: bold; }
.rank-profit.neg { color: #ff6b6b; font-weight: bold; }
.notice { margin-top: 16px; color: #ffd54f; font-size: 14px; }
</style>
