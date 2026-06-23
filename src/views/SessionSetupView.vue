<template>
  <div class="session-setup">
    <div class="setup-card">
      <h1>{{ isEdit ? t('session.edit') : t('session.create') }}</h1>

      <!-- Basic info -->
      <div class="form-group">
        <label>{{ t('session.name') }}</label>
        <input v-model="form.name" type="text" :placeholder="defaultName" />
      </div>

      <div class="form-group">
        <label>{{ t('session.dateTime') }}</label>
        <input v-model="dateTimeLocal" type="datetime-local" />
      </div>

      <div class="form-group">
        <label>{{ t('session.maxPlayers') }}</label>
        <input v-model.number="form.maxPlayers" type="number" min="2" max="50" />
      </div>

      <div class="form-group">
        <label>{{ t('session.location') }}</label>
        <input v-model="form.location.name" type="text" :placeholder="t('session.locationPlaceholder')" />
        <label class="checkbox-row">
          <input v-model="form.location.showToJoinedOnly" type="checkbox" />
          <span>{{ t('session.locationPrivate') }}</span>
        </label>
      </div>

      <!-- Table queue -->
      <div class="queue-section">
        <h2>{{ t('session.tableQueue') }}</h2>

        <div v-if="form.tableQueue.length === 0" class="queue-empty">
          {{ t('session.mustHaveTable') }}
        </div>

        <div
          v-for="(row, i) in form.tableQueue"
          :key="i"
          class="queue-row"
          :class="{ locked: isRowLocked(row) }"
        >
          <div class="queue-order">{{ i + 1 }}</div>

          <div class="queue-fields">
            <div class="queue-line">
              <select v-model="row.kind" :disabled="isRowLocked(row)" @change="onKindChange(row)">
                <option value="cash">{{ t('session.cash') }}</option>
                <option value="tournament">{{ t('session.tournament') }}</option>
              </select>

              <select
                v-model="row.presetId"
                :disabled="isRowLocked(row)"
                @change="onPresetSelect(row)"
              >
                <option value="">{{ t('session.selectPreset') }}</option>
                <option
                  v-for="opt in presetOptions(row.kind)"
                  :key="opt.id"
                  :value="opt.id"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div v-if="isRowLocked(row)" class="queue-status">
              {{ row.status === 'active' ? t('session.statusActive') : t('session.done') }} · {{ t('session.locked') }}
            </div>
          </div>

          <div class="queue-actions" v-if="!isRowLocked(row)">
            <button :disabled="i === 0 || isRowLocked(form.tableQueue[i - 1])" :title="t('session.moveUp')" @click="moveUp(i)">▲</button>
            <button :disabled="i === form.tableQueue.length - 1" :title="t('session.moveDown')" @click="moveDown(i)">▼</button>
            <button class="remove" :title="t('session.remove')" @click="removeTable(i)">✕</button>
          </div>
        </div>

        <button class="btn-add" @click="addTable">＋ {{ t('session.addTable') }}</button>
      </div>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <div class="setup-actions">
        <button class="btn-cancel" @click="goBack">{{ t('common.cancel') }}</button>
        <button class="btn-confirm" :disabled="saving" @click="save">
          {{ saving ? t('loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSessions } from '../composables/useSessions.js';
import { useCashPresets } from '../composables/useCashPresets.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { defaultSessionName } from '../utils/sessionFlow.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { createSession, updateSession, getSession } = useSessions();
const cashPresetsApi = useCashPresets();
const tournamentApi = useTournamentClock();

const isEdit = computed(() => !!route.params.sessionId);
const defaultName = defaultSessionName(Date.now());

const cashPresets = ref([]);
const userTournamentPresets = ref([]);
const saving = ref(false);
const errorMsg = ref('');

const form = reactive({
  name: '',
  dateTimeMs: Date.now(),
  maxPlayers: 8,
  location: { name: '', showToJoinedOnly: false },
  tableQueue: [],
});

// ── datetime-local <-> ms ──────────────────────────────
const dateTimeLocal = computed({
  get() {
    const d = new Date(form.dateTimeMs);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  set(v) {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) form.dateTimeMs = ms;
  },
});

// ── Preset option lists ────────────────────────────────
function presetOptions(kind) {
  if (kind === 'tournament') {
    const builtin = TOURNAMENT_TEMPLATES.map((tpl) => ({
      id: `tpl:${tpl.id}`,
      label: `${tpl.name} (${t('session.cash')}: ${tpl.buyIn})`,
      source: tpl,
    }));
    const user = userTournamentPresets.value.map((p) => ({
      id: `usr:${p.id}`,
      label: p.name || p.id,
      source: p,
    }));
    return [...builtin, ...user];
  }
  return cashPresets.value.map((p) => ({
    id: p.id,
    label: `${p.name} (${p.buyIn})`,
    source: p,
  }));
}

function findOption(kind, id) {
  return presetOptions(kind).find((o) => o.id === id) || null;
}

// ── Queue manipulation ─────────────────────────────────
function isRowLocked(row) {
  return row.status === 'active' || row.status === 'done';
}

function addTable() {
  form.tableQueue.push({
    kind: 'cash',
    presetId: '',
    presetSnapshot: {},
    label: '',
    status: 'queued',
    gameId: null,
    tournamentSessionId: null,
  });
}

function removeTable(i) {
  form.tableQueue.splice(i, 1);
}

function moveUp(i) {
  if (i === 0) return;
  const arr = form.tableQueue;
  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
}

function moveDown(i) {
  const arr = form.tableQueue;
  if (i >= arr.length - 1) return;
  [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
}

function onKindChange(row) {
  row.presetId = '';
  row.presetSnapshot = {};
  row.label = '';
}

function onPresetSelect(row) {
  const opt = findOption(row.kind, row.presetId);
  if (!opt) {
    row.presetSnapshot = {};
    row.label = '';
    return;
  }
  const s = opt.source;
  if (row.kind === 'tournament') {
    row.presetSnapshot = {
      name: s.name || '',
      subtitle: s.subtitle || '',
      buyIn: Number(s.buyIn) || 0,
      startingChips: s.startingChips,
      reentryUntilLevel: s.reentryUntilLevel,
      maxReentries: s.maxReentries,
      levels: s.levels,
      payoutRatios: s.payoutRatios,
    };
  } else {
    row.presetSnapshot = {
      name: s.name || '',
      buyIn: Number(s.buyIn) || 0,
      rate: Number(s.rate) || 1,
    };
  }
  row.label = `${opt.label}`;
}

// ── Load (edit mode) ───────────────────────────────────
let unsubCash = null;
let unsubTour = null;

onMounted(async () => {
  unsubCash = cashPresetsApi.listenPresets((list) => { cashPresets.value = list; });
  unsubTour = tournamentApi.listenPresets((list) => { userTournamentPresets.value = list; });

  if (isEdit.value) {
    const s = await getSession(route.params.sessionId);
    if (s) {
      form.name = s.name || '';
      form.dateTimeMs = s.dateTimeMs || Date.now();
      form.maxPlayers = s.maxPlayers || 8;
      form.location = {
        name: s.location?.name || '',
        showToJoinedOnly: !!s.location?.showToJoinedOnly,
      };
      form.tableQueue = (s.tableQueue || []).map((e) => ({
        id: e.id || null, // preserve stable id so RSVP tableIds keep matching
        kind: e.kind || 'cash',
        presetId: '', // not re-selectable; snapshot already stored
        presetSnapshot: e.presetSnapshot || {},
        label: e.label || (e.presetSnapshot?.name || ''),
        status: e.status || 'queued',
        gameId: e.gameId || null,
        tournamentSessionId: e.tournamentSessionId || null,
      }));
    }
  } else {
    form.name = defaultName;
    addTable();
  }
});

// ── Save ───────────────────────────────────────────────
function validate() {
  if (form.tableQueue.length === 0) {
    errorMsg.value = t('session.mustHaveTable');
    return false;
  }
  // Every queued row must have a chosen preset (snapshot with a buy-in).
  const incomplete = form.tableQueue.some(
    (r) => r.status === 'queued' && !(r.presetSnapshot && r.presetSnapshot.name)
  );
  if (incomplete) {
    errorMsg.value = t('session.selectPreset');
    return false;
  }
  errorMsg.value = '';
  return true;
}

async function save() {
  if (!validate()) return;
  saving.value = true;
  try {
    const payload = {
      name: form.name || defaultName,
      dateTimeMs: form.dateTimeMs,
      maxPlayers: form.maxPlayers,
      location: { ...form.location },
      tableQueue: form.tableQueue,
    };
    if (isEdit.value) {
      await updateSession(route.params.sessionId, payload);
      router.push(`/session/${route.params.sessionId}`);
    } else {
      const id = await createSession(payload);
      if (id) router.push(`/session/${id}`);
      else errorMsg.value = t('session.actionFailed');
    }
  } catch (err) {
    console.error('Save session error:', err);
    errorMsg.value = err.message || t('session.actionFailed');
  } finally {
    saving.value = false;
  }
}

function goBack() {
  if (isEdit.value) router.push(`/session/${route.params.sessionId}`);
  else router.push('/lobby');
}

onUnmounted(() => {
  if (unsubCash) unsubCash();
  if (unsubTour) unsubTour();
});
</script>

<style scoped>
.session-setup {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 32px 16px;
}

.setup-card {
  max-width: 640px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 28px;
  color: white;
}

.setup-card h1 {
  margin: 0 0 24px;
  font-size: 26px;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.85);
}

.form-group input[type='text'],
.form-group input[type='number'],
.form-group input[type='datetime-local'] {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 16px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-weight: normal;
}

.checkbox-row input { width: auto; }

.queue-section {
  margin-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.queue-section h2 {
  font-size: 18px;
  margin: 0 0 12px;
}

.queue-empty {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  margin-bottom: 12px;
}

.queue-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.queue-row.locked { opacity: 0.6; }

.queue-order {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2196F3;
  border-radius: 50%;
  font-weight: bold;
  font-size: 14px;
}

.queue-fields { flex: 1; }

.queue-line {
  display: flex;
  gap: 8px;
}

.queue-line select {
  flex: 1;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 14px;
}

.queue-status {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.queue-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.queue-actions button {
  width: 30px;
  height: 26px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  cursor: pointer;
}

.queue-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
.queue-actions button.remove { color: #ff6b6b; }

.btn-add {
  width: 100%;
  padding: 10px;
  background: rgba(76, 175, 80, 0.2);
  border: 1px dashed rgba(76, 175, 80, 0.6);
  border-radius: 8px;
  color: #8fe08f;
  font-weight: bold;
  cursor: pointer;
}

.error-msg {
  color: #ff6b6b;
  font-size: 14px;
  margin-top: 14px;
}

.setup-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}

.btn-cancel { background: #666; color: white; }
.btn-confirm { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
