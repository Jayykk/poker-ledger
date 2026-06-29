<template>
  <div class="session-setup">
    <div class="setup-card">
      <h1>{{ isEdit ? t('session.edit') : t('session.create') }}</h1>

      <!-- Quick personal setup: one-tap load / save "the usual" event -->
      <div v-if="!isEdit" class="quick-bar">
        <div class="quick-actions">
          <button class="btn-quick load" :disabled="!quickSetup" @click="applyQuickSetup">
            ⚡ {{ t('session.loadQuick') }}
          </button>
          <button class="btn-quick save" :disabled="quickSaving" @click="saveAsQuickSetup">
            💾 {{ t('session.saveQuick') }}
          </button>
        </div>
        <p class="quick-hint">
          {{ quickMsg || (quickSetup ? t('session.quickHint') : t('session.quickEmpty')) }}
        </p>
      </div>

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
        <label>{{ t('session.location') }}</label>
        <input v-model="form.location.name" type="text" :placeholder="t('session.locationPlaceholder')" />
      </div>

      <!-- Periods -->
      <div class="queue-section">
        <h2>{{ t('session.periods') }}</h2>

        <div v-if="form.periods.length === 0" class="queue-empty">
          {{ t('session.mustHavePeriod') }}
        </div>

        <div
          v-for="(row, i) in form.periods"
          :key="row.id || i"
          class="period-row"
          :class="{ locked: isRowLocked(row) }"
        >
          <div class="period-head">
            <div class="queue-order">{{ i + 1 }}</div>
            <input
              class="period-label"
              v-model="row.label"
              :disabled="isRowLocked(row)"
              type="text"
              :placeholder="t('session.periodLabelPlaceholder')"
            />
            <div class="queue-actions" v-if="!isRowLocked(row)">
              <button :disabled="i === 0 || isRowLocked(form.periods[i - 1])" :title="t('session.moveUp')" @click="moveUp(i)">▲</button>
              <button :disabled="i === form.periods.length - 1" :title="t('session.moveDown')" @click="moveDown(i)">▼</button>
              <button class="remove" :title="t('session.remove')" @click="removePeriod(i)">✕</button>
            </div>
          </div>

          <div class="period-line">
            <select v-model="row.type" :disabled="isRowLocked(row)" @change="onTypeChange(row)">
              <option value="cash">{{ t('session.cash') }}</option>
              <option value="tournament">{{ t('session.tournament') }}</option>
              <option value="custom">{{ t('session.custom') }}</option>
            </select>
            <label class="cap">
              <span>{{ t('session.slotMax') }}</span>
              <input v-model.number="row.maxPlayers" :disabled="isRowLocked(row)" type="number" min="1" max="50" />
            </label>
          </div>

          <select
            v-if="row.type !== 'custom'"
            v-model="row.presetId"
            :disabled="isRowLocked(row)"
            @change="onPresetSelect(row)"
          >
            <option value="">{{ presetSnapshotLabel(row) || t('session.selectPreset') }}</option>
            <option v-for="opt in presetOptions(row.type)" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>

          <div v-if="isRowLocked(row)" class="queue-status">
            {{ row.status === 'active' ? t('session.statusActive') : t('session.done') }} · {{ t('session.locked') }}
          </div>
        </div>

        <button class="btn-add" @click="addPeriod">＋ {{ t('session.addPeriod') }}</button>
      </div>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <div class="setup-actions">
        <button class="btn-cancel" @click="goBack">{{ t('common.cancel') }}</button>
        <button class="btn-confirm" :disabled="saving" @click="save">
          {{ saving ? t('loading') : (isEdit ? t('session.modifyPeriods') : t('common.save')) }}
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
import { useLiff } from '../composables/useLiff.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { defaultSessionName } from '../utils/sessionFlow.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { createSession, updateSession, getSession, getSessionQuickSetup, saveSessionQuickSetup } = useSessions();
const cashPresetsApi = useCashPresets();
const tournamentApi = useTournamentClock();
const { sendSessionUpdateMessage } = useLiff();

const isEdit = computed(() => !!route.params.sessionId);
const defaultName = defaultSessionName(Date.now());

const cashPresets = ref([]);
const userTournamentPresets = ref([]);
const saving = ref(false);
const errorMsg = ref('');
let loadedSig = '';

// Personal quick-setup ("the usual" event): null until loaded/saved.
const quickSetup = ref(null);
const quickSaving = ref(false);
const quickMsg = ref('');

const form = reactive({
  name: '',
  dateTimeMs: Date.now(),
  location: { name: '' },
  periods: [],
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
function presetOptions(type) {
  if (type === 'tournament') {
    const builtin = TOURNAMENT_TEMPLATES.map((tpl) => ({ id: `tpl:${tpl.id}`, label: `${tpl.name} (${tpl.buyIn})`, source: tpl }));
    const user = userTournamentPresets.value.map((p) => ({ id: `usr:${p.id}`, label: p.name || p.id, source: p }));
    return [...builtin, ...user];
  }
  return cashPresets.value.map((p) => ({ id: p.id, label: `${p.name} (${p.buyIn})`, source: p }));
}
function findOption(type, id) {
  return presetOptions(type).find((o) => o.id === id) || null;
}
function presetSnapshotLabel(row) {
  return row.presetSnapshot && row.presetSnapshot.name ? row.presetSnapshot.name : '';
}

// ── Period manipulation ────────────────────────────────
function isRowLocked(row) {
  return row.status === 'active' || row.status === 'done';
}
function addPeriod() {
  form.periods.push({
    id: null, label: '', type: 'cash', maxPlayers: 8,
    presetId: '', presetSnapshot: {}, roster: [], rosterUids: [],
    status: 'queued', gameId: null, tournamentSessionId: null,
  });
}
function removePeriod(i) { form.periods.splice(i, 1); }
function moveUp(i) {
  if (i === 0) return;
  const a = form.periods;
  [a[i - 1], a[i]] = [a[i], a[i - 1]];
}
function moveDown(i) {
  const a = form.periods;
  if (i >= a.length - 1) return;
  [a[i + 1], a[i]] = [a[i], a[i + 1]];
}
function onTypeChange(row) {
  row.presetId = '';
  row.presetSnapshot = {};
}
function onPresetSelect(row) {
  const opt = findOption(row.type, row.presetId);
  if (!opt) { row.presetSnapshot = {}; return; }
  const s = opt.source;
  if (row.type === 'tournament') {
    row.presetSnapshot = {
      name: s.name || '', subtitle: s.subtitle || '', buyIn: Number(s.buyIn) || 0,
      startingChips: s.startingChips, reentryUntilLevel: s.reentryUntilLevel,
      maxReentries: s.maxReentries, levels: s.levels, payoutRatios: s.payoutRatios,
    };
  } else {
    row.presetSnapshot = { name: s.name || '', buyIn: Number(s.buyIn) || 0, rate: Number(s.rate) || 1 };
  }
}

// ── Personal quick-setup (load / save "the usual" event) ──
function periodFromQuick(p) {
  return {
    id: null,
    label: p.label || '',
    type: p.type || 'cash',
    maxPlayers: Number(p.maxPlayers) || 8,
    presetId: '',
    presetSnapshot: p.presetSnapshot || {},
    roster: [], rosterUids: [],
    status: 'queued', gameId: null, tournamentSessionId: null,
  };
}
function applyQuickSetup() {
  const qs = quickSetup.value;
  if (!qs) return;
  form.location.name = qs.location?.name || '';
  const rows = (qs.periods || []).map(periodFromQuick);
  if (rows.length) form.periods = rows;
  errorMsg.value = '';
}
async function saveAsQuickSetup() {
  quickSaving.value = true;
  errorMsg.value = '';
  try {
    const setup = {
      location: { name: form.location.name || '' },
      periods: form.periods.map((p) => ({
        label: p.label || '',
        type: p.type || 'cash',
        maxPlayers: Number(p.maxPlayers) || 8,
        presetSnapshot: p.presetSnapshot || {},
      })),
    };
    await saveSessionQuickSetup(setup);
    quickSetup.value = setup;
    quickMsg.value = t('session.quickSaved');
    setTimeout(() => { quickMsg.value = ''; }, 2500);
  } catch (err) {
    console.error('Save quick setup error:', err);
    errorMsg.value = err.message || t('session.actionFailed');
  } finally {
    quickSaving.value = false;
  }
}

// ── Change signature (for "modify periods" notification) ──
function periodsSig(periods) {
  return JSON.stringify((periods || []).map((p) => ({
    label: p.label || '', type: p.type, max: Number(p.maxPlayers) || 0,
    preset: p.presetSnapshot?.name || '',
  })));
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
      form.location = { name: s.location?.name || '' };
      form.periods = (s.periods || []).map((e) => ({
        id: e.id || null,
        label: e.label || '',
        type: e.type || 'cash',
        maxPlayers: e.maxPlayers || 8,
        presetId: '', // snapshot already stored; not re-selectable
        presetSnapshot: e.presetSnapshot || {},
        roster: e.roster || [],
        rosterUids: e.rosterUids || [],
        status: e.status || 'queued',
        gameId: e.gameId || null,
        tournamentSessionId: e.tournamentSessionId || null,
      }));
      loadedSig = periodsSig(form.periods);
    }
  } else {
    form.name = defaultName;
    addPeriod();
    try { quickSetup.value = await getSessionQuickSetup(); } catch (_) { quickSetup.value = null; }
  }
});

onUnmounted(() => {
  if (unsubCash) unsubCash();
  if (unsubTour) unsubTour();
});

// ── Save ───────────────────────────────────────────────
function validate() {
  if (form.periods.length === 0) { errorMsg.value = t('session.mustHavePeriod'); return false; }
  for (const p of form.periods) {
    if (!p.label || !p.label.trim()) { errorMsg.value = t('session.periodLabel'); return false; }
    if (!(Number(p.maxPlayers) > 0)) { errorMsg.value = t('session.slotMax'); return false; }
    if (p.status === 'queued' && p.type !== 'custom' && !(p.presetSnapshot && p.presetSnapshot.name)) {
      errorMsg.value = t('session.selectPreset'); return false;
    }
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
      location: { name: form.location.name },
      periods: form.periods,
    };
    if (isEdit.value) {
      const changed = periodsSig(form.periods) !== loadedSig;
      await updateSession(route.params.sessionId, payload);
      if (changed) {
        const fresh = await getSession(route.params.sessionId);
        if (fresh) sendSessionUpdateMessage(fresh);
      }
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
</script>

<style scoped>
.session-setup {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  /* clear the fixed bottom nav + FAB */
  padding: 32px 16px 120px;
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

.setup-card h1 { margin: 0 0 16px; font-size: 26px; }

.quick-bar {
  margin-bottom: 20px;
  padding: 12px;
  background: rgba(255, 193, 7, 0.08);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 10px;
}
.quick-actions { display: flex; gap: 10px; }
.btn-quick {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 193, 7, 0.5);
  background: rgba(255, 193, 7, 0.15);
  color: #ffd766;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
}
.btn-quick:disabled { opacity: 0.4; cursor: not-allowed; }
.quick-hint { margin: 8px 2px 0; font-size: 12px; color: rgba(255, 255, 255, 0.6); }

.form-group { margin-bottom: 18px; }
.form-group label { display: block; margin-bottom: 6px; font-weight: bold; color: rgba(255, 255, 255, 0.85); }
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

.queue-section { margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 16px; }
.queue-section h2 { font-size: 18px; margin: 0 0 12px; }
.queue-empty { color: rgba(255, 255, 255, 0.5); font-size: 14px; margin-bottom: 12px; }

.period-row {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.period-row.locked { opacity: 0.6; }

.period-head { display: flex; align-items: center; gap: 10px; }
.queue-order {
  width: 26px; height: 26px; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  background: #2196F3; border-radius: 50%; font-weight: bold; font-size: 14px;
}
.period-label {
  flex: 1; min-width: 0; box-sizing: border-box;
  padding: 8px; background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; font-size: 15px;
}

.period-line { display: flex; gap: 8px; align-items: center; }
.period-line select {
  flex: 1; min-width: 0; padding: 8px;
  background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px; color: white; font-size: 14px;
}
.cap { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(255,255,255,0.7); }
.cap input { width: 64px; padding: 8px; box-sizing: border-box; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: white; }

.period-row > select {
  padding: 8px; background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; font-size: 14px;
}

.queue-actions { display: flex; gap: 4px; }
.queue-actions button {
  width: 30px; height: 26px; background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: white; cursor: pointer;
}
.queue-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
.queue-actions button.remove { color: #ff6b6b; }
.queue-status { font-size: 12px; color: rgba(255, 255, 255, 0.55); }

.btn-add {
  width: 100%; padding: 10px;
  background: rgba(76, 175, 80, 0.2); border: 1px dashed rgba(76, 175, 80, 0.6);
  border-radius: 8px; color: #8fe08f; font-weight: bold; cursor: pointer;
}

.error-msg { color: #ff6b6b; font-size: 14px; margin-top: 14px; }
.setup-actions { display: flex; gap: 12px; margin-top: 24px; }
.btn-cancel, .btn-confirm { flex: 1; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
.btn-cancel { background: #666; color: white; }
.btn-confirm { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
