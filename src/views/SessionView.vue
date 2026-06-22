<template>
  <div class="session-view">
    <div v-if="loading && !session" class="state-msg">{{ t('loading') }}</div>

    <div v-else-if="!session" class="state-msg">{{ t('session.ended') }}</div>

    <!-- Redirecting a roster member to the active table -->
    <div v-else-if="view.mode === 'redirect'" class="state-msg">
      {{ t('session.redirecting') }}
    </div>

    <!-- Block wall: not signed up for an active event -->
    <div v-else-if="view.mode === 'blocked'" class="card wall">
      <div class="wall-icon">🚧</div>
      <h2>{{ t('session.notJoinedTitle') }}</h2>
      <p>{{ t('session.notJoinedMsg') }}</p>
    </div>

    <!-- Everything else: scheduling RSVP, host console, or completed summary -->
    <div v-else class="card">
      <header class="head">
        <h1>{{ session.name }}</h1>
        <span class="status-pill" :class="session.status">{{ statusLabel }}</span>
      </header>

      <div class="meta">
        <div class="meta-row"><span>🗓️</span><span>{{ formatDateTime(session.dateTimeMs) }}</span></div>
        <div v-if="showLocation" class="meta-row"><span>📍</span><span>{{ session.location.name }}</span></div>
        <div class="meta-row"><span>👥</span><span>{{ rosterText }}</span></div>
      </div>

      <!-- Roster -->
      <section class="roster">
        <h3>{{ t('session.roster') }}</h3>
        <ul>
          <li v-for="(r, i) in session.roster" :key="r.uid || i">
            <span class="seat-no">{{ i + 1 }}</span>{{ r.name }}
          </li>
          <li v-if="!session.roster || session.roster.length === 0" class="muted">—</li>
        </ul>
      </section>

      <!-- RSVP CTA (non-host, scheduling) -->
      <div v-if="view.mode === 'rsvp'" class="cta">
        <button v-if="amJoined" class="btn-danger" @click="onCancel">{{ t('session.cancelRsvp') }}</button>
        <button v-else :disabled="full" class="btn-primary" @click="onJoin">
          {{ full ? t('session.full') : t('session.join') }}
        </button>
      </div>

      <!-- Host console -->
      <div v-if="view.mode === 'host-console'" class="console">
        <h3>{{ t('session.tableQueue') }}</h3>
        <ol class="queue-plan">
          <li v-for="(row, i) in session.tableQueue" :key="i" :class="row.status">
            <span class="kind">{{ row.kind === 'tournament' ? t('session.tournament') : t('session.cash') }}</span>
            <span class="qlabel">{{ row.label || row.presetSnapshot?.name || '—' }}</span>
            <span class="qstatus">{{ queueStatusLabel(row.status) }}</span>
          </li>
        </ol>

        <div class="host-actions">
          <button v-if="session.status === 'scheduling'" class="btn-primary" @click="onStart">
            {{ t('session.startEvent') }}
          </button>
          <template v-if="session.status === 'active'">
            <button v-if="view.route" class="btn-secondary" @click="enterTable">{{ t('session.enterTable') }}</button>
            <button class="btn-primary" @click="onNext">{{ t('session.nextTable') }}</button>
            <button class="btn-danger" @click="onEnd">{{ t('session.endEvent') }}</button>
          </template>
          <button class="btn-ghost" @click="onEdit">{{ t('session.editTables') }}</button>
        </div>

        <div class="share-actions">
          <button class="btn-ghost" @click="onShareInvite">📤 {{ t('session.shareInvite') }}</button>
          <button v-if="session.status === 'active'" class="btn-ghost" @click="onShareTable">🃏 {{ t('session.shareTable') }}</button>
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
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../store/modules/auth.js';
import { useSessions } from '../composables/useSessions.js';
import { useLiff } from '../composables/useLiff.js';
import {
  resolveSessionView, canViewLocation, isRosterMember, rosterCount, isFull,
} from '../utils/sessionFlow.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const {
  session, loading, listenSession,
  rsvp, cancelRsvp, activateFirstTable, advanceToNextTable, endSession, loadSessionSummary,
} = useSessions();
const { shareSessionInvite, shareSessionTableCard, shareSessionSummary } = useLiff();

const uid = computed(() => authStore.user?.uid || null);
const summary = ref(null);
const notice = ref('');
let redirected = false;

const view = computed(() => resolveSessionView(session.value, uid.value));
const amJoined = computed(() => isRosterMember(session.value, uid.value));
const full = computed(() => isFull(session.value));
const showLocation = computed(() => canViewLocation(session.value, uid.value));

const rosterText = computed(() => {
  const max = Number(session.value?.maxPlayers) || 0;
  return `${rosterCount(session.value)}/${max}`;
});

const statusLabel = computed(() => {
  switch (session.value?.status) {
  case 'scheduling': return t('session.queued');
  case 'active': return t('session.statusActive');
  case 'completed': return t('session.done');
  default: return '';
  }
});

function queueStatusLabel(s) {
  if (s === 'active') return t('session.statusActive');
  if (s === 'done') return t('session.done');
  return t('session.queued');
}

function medal(i) {
  return ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
}

function formatDateTime(ms) {
  const d = new Date(Number(ms) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function withNotice(fn) {
  notice.value = '';
  try {
    await fn();
  } catch (err) {
    notice.value = err?.message || t('session.actionFailed');
  }
}

const onJoin = () => withNotice(() => rsvp(route.params.sessionId));
const onCancel = () => withNotice(() => cancelRsvp(route.params.sessionId));
const onStart = () => withNotice(() => activateFirstTable(route.params.sessionId));
const onNext = () => withNotice(() => advanceToNextTable(route.params.sessionId));
const onEnd = () => withNotice(async () => {
  if (!window.confirm(t('session.confirmEnd'))) return;
  await endSession(route.params.sessionId);
});
const onEdit = () => router.push(`/session-setup/${route.params.sessionId}`);
const enterTable = () => { if (view.value.route) router.push(view.value.route); };

const onShareInvite = () => withNotice(() => shareSessionInvite(session.value));
const onShareTable = () => withNotice(() => shareSessionTableCard(session.value));
const onShareSummary = () => withNotice(() => shareSessionSummary(session.value, summary.value));

// Redirect roster members to the live table once it is active.
watch(view, (v) => {
  if (v.mode === 'redirect' && v.route && !redirected) {
    redirected = true;
    router.replace(v.route);
  }
}, { immediate: true });

// Load the cross-table summary once the event is completed.
watch(() => session.value?.status, async (status) => {
  if (status === 'completed' && !summary.value) {
    summary.value = await loadSessionSummary(route.params.sessionId);
  }
});

onMounted(() => {
  listenSession(route.params.sessionId);
});
</script>

<style scoped>
.session-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 32px 16px;
  color: white;
}

.state-msg {
  max-width: 560px;
  margin: 80px auto;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
}

.card {
  max-width: 560px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.head h1 { margin: 0; font-size: 24px; }

.status-pill {
  flex: 0 0 auto;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}
.status-pill.scheduling { background: #2196F3; }
.status-pill.active { background: #ff9800; }
.status-pill.completed { background: #607d8b; }

.meta {
  margin: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta-row {
  display: flex;
  gap: 10px;
  color: rgba(255, 255, 255, 0.85);
}

.roster h3, .console h3, .summary h3 {
  font-size: 16px;
  margin: 18px 0 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 14px;
}

.roster ul { list-style: none; padding: 0; margin: 0; }
.roster li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  color: rgba(255, 255, 255, 0.9);
}
.seat-no {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  font-size: 12px;
}
.muted { color: rgba(255, 255, 255, 0.45); }

.cta { margin-top: 20px; }

.queue-plan { margin: 0 0 16px; padding-left: 18px; }
.queue-plan li {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}
.queue-plan li.active .qstatus { color: #ffb74d; font-weight: bold; }
.queue-plan li.done { opacity: 0.55; }
.kind {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.12);
  padding: 2px 8px;
  border-radius: 10px;
}
.qlabel { flex: 1; }
.qstatus { font-size: 12px; color: rgba(255, 255, 255, 0.6); }

.host-actions, .share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

button {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  font-size: 14px;
}
.btn-primary { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; flex: 1; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; }
.btn-danger { background: #c0392b; color: white; }
.btn-ghost { background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255, 255, 255, 0.2); }
.full-w { width: 100%; margin-top: 12px; }

.wall { text-align: center; }
.wall-icon { font-size: 48px; }

.summary-totals {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.summary-totals div {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}
.summary-totals span { display: block; font-size: 12px; color: rgba(255, 255, 255, 0.6); }
.summary-totals strong { font-size: 20px; }

.rank-list { list-style: none; padding: 0; margin: 0; }
.rank-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.rank-medal { width: 24px; }
.rank-name { flex: 1; }
.rank-profit.pos { color: #4caf50; font-weight: bold; }
.rank-profit.neg { color: #ff6b6b; font-weight: bold; }

.notice {
  margin-top: 16px;
  color: #ffd54f;
  font-size: 14px;
}
</style>
