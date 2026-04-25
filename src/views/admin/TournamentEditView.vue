<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="handleBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">{{ $t('admin.tournamentEdit.title') }}</h1>
        <button
          @click="handleSaveClick"
          :disabled="!canEditItem || isStatusLocked(session)"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition"
          :class="canEditItem && !isStatusLocked(session)
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-slate-600 text-gray-400 cursor-not-allowed'"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-6">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <i class="fas fa-spinner fa-spin text-2xl text-amber-400"></i>
      </div>

      <template v-else-if="session">
        <!-- Permission denied -->
        <div v-if="!canEditItem" class="bg-red-900/30 border border-red-700 rounded-2xl p-5 text-center">
          <i class="fas fa-lock text-3xl text-red-400 mb-3 block"></i>
          <p class="text-red-300 font-semibold">{{ $t('admin.permissionDenied') }}</p>
          <p class="text-gray-400 text-sm mt-1">{{ $t('admin.permissionDeniedHint') }}</p>
        </div>

        <template v-else>
          <!-- Ended lock banner -->
          <div v-if="isStatusLocked(session)" class="bg-slate-700/60 border border-slate-600 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-archive text-gray-400 text-xl"></i>
            <div>
              <p class="text-white font-semibold text-sm">{{ $t('admin.statusLocked') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusLockedHint') }}</p>
            </div>
          </div>

          <!-- Active warning -->
          <div v-else-if="isStatusWarning(session)" class="bg-amber-600/20 border border-amber-600/50 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-exclamation-triangle text-amber-400 text-xl"></i>
            <div>
              <p class="text-amber-300 font-semibold text-sm">{{ $t('admin.statusActiveWarning') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusActiveHint') }}</p>
            </div>
          </div>

          <!-- ── Basic Info ─────────────────────────────────────────── -->
          <section class="card">
            <h2 class="section-title">{{ $t('tournament.basicInfo') }}</h2>
            <div class="space-y-3">
              <div>
                <label class="field-label">{{ $t('tournament.tournamentName') }}</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="field-input"
                  :placeholder="$t('tournament.namePlaceholder')"
                  :disabled="isStatusLocked(session)"
                />
              </div>
              <div>
                <label class="field-label">{{ $t('tournament.subtitle') }}</label>
                <input
                  v-model="form.subtitle"
                  type="text"
                  class="field-input"
                  :placeholder="$t('tournament.subtitlePlaceholder')"
                  :disabled="isStatusLocked(session)"
                />
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.buyInAmount') }}</label>
                  <input
                    v-model.number="form.buyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(session)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.startingChips') }}</label>
                  <input
                    v-model.number="form.startingChips"
                    type="number"
                    min="1000"
                    step="1000"
                    class="field-input"
                    :disabled="isStatusLocked(session)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.reentryLevel') }}</label>
                  <input
                    v-model.number="form.reentryUntilLevel"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(session)"
                  />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.maxReentries') }}</label>
                  <input
                    v-model.number="form.maxReentries"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(session)"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- ── Blind Structure ──────────────────────────────────── -->
          <section class="card">
            <div class="flex items-center justify-between mb-3">
              <h2 class="section-title mb-0">{{ $t('tournament.blindStructure') }}</h2>
              <div v-if="!isStatusLocked(session)" class="flex gap-2">
                <button @click="addLevel" class="text-sm text-emerald-400 hover:text-emerald-300">
                  <i class="fas fa-plus mr-1"></i>{{ $t('tournament.addLevel') }}
                </button>
                <button @click="addBreak" class="text-sm text-blue-400 hover:text-blue-300">
                  <i class="fas fa-coffee mr-1"></i>{{ $t('tournament.addBreak') }}
                </button>
              </div>
            </div>
            <!-- Header row -->
            <div class="blind-grid header">
              <span>#</span>
              <span>{{ $t('tournament.smallBlind') }}</span>
              <span>{{ $t('tournament.bigBlind') }}</span>
              <span>{{ $t('tournament.ante') }}</span>
              <span>{{ $t('tournament.duration') }}</span>
              <span></span>
            </div>
            <!-- Level rows -->
            <div
              v-for="(lvl, idx) in form.levels"
              :key="idx"
              class="blind-grid"
              :class="{ 'break-row': lvl.isBreak }"
            >
              <span class="text-gray-400 text-sm self-center">{{ lvl.isBreak ? '☕' : lvl.level }}</span>
              <template v-if="lvl.isBreak">
                <span class="col-span-3 text-blue-300 text-sm self-center text-center">{{ $t('tournament.breakTime') }}</span>
              </template>
              <template v-else>
                <input v-model.number="lvl.small" type="number" min="0" class="level-input" :disabled="isStatusLocked(session)" />
                <input v-model.number="lvl.big" type="number" min="0" class="level-input" :disabled="isStatusLocked(session)" />
                <input v-model.number="lvl.ante" type="number" min="0" class="level-input" :disabled="isStatusLocked(session)" />
              </template>
              <div class="flex items-center gap-1">
                <input v-model.number="lvl.duration" type="number" min="1" class="level-input w-14" :disabled="isStatusLocked(session)" />
                <span class="text-gray-500 text-xs">min</span>
              </div>
              <button
                v-if="!isStatusLocked(session)"
                @click="removeLevel(idx)"
                class="text-red-400 hover:text-red-300"
              >
                <i class="fas fa-trash-alt text-sm"></i>
              </button>
              <span v-else></span>
            </div>
          </section>

          <!-- ── Payout Structure ─────────────────────────────────── -->
          <section class="card">
            <div class="flex items-center justify-between mb-3">
              <h2 class="section-title mb-0">{{ $t('tournament.payoutStructure') }}</h2>
              <button
                v-if="!isStatusLocked(session)"
                @click="addPayout"
                class="text-sm text-emerald-400 hover:text-emerald-300"
              >
                <i class="fas fa-plus mr-1"></i>{{ $t('tournament.addPlace') }}
              </button>
            </div>
            <div class="space-y-2">
              <div
                v-for="(p, idx) in form.payoutRatios"
                :key="idx"
                class="flex items-center gap-3"
              >
                <span class="text-gray-400 text-sm w-8">{{ p.place }}.</span>
                <div class="flex items-center gap-1 flex-1">
                  <input
                    v-model.number="p.percentage"
                    type="number"
                    min="0"
                    max="100"
                    class="level-input flex-1"
                    :disabled="isStatusLocked(session)"
                  />
                  <span class="text-gray-400 text-sm">%</span>
                </div>
                <button
                  v-if="!isStatusLocked(session)"
                  @click="removePayout(idx)"
                  class="text-red-400 hover:text-red-300"
                >
                  <i class="fas fa-trash-alt text-sm"></i>
                </button>
              </div>
              <div
                class="text-right text-sm"
                :class="payoutTotal === 100 ? 'text-emerald-400' : 'text-red-400'"
              >
                {{ $t('tournament.total') }}: {{ payoutTotal }}%
              </div>
            </div>
          </section>

          <!-- ── Version History ───────────────────────────────────── -->
          <section class="card">
            <div class="flex items-center justify-between mb-3">
              <h2 class="section-title mb-0">{{ $t('admin.versionHistory.title') }}</h2>
              <button @click="loadVersions" class="text-xs text-amber-400 hover:text-amber-300">
                <i class="fas fa-history mr-1"></i>{{ $t('admin.versionHistory.load') }}
              </button>
            </div>

            <div v-if="loadingVersions" class="text-center py-4 text-gray-400">
              <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div v-else-if="versions.length === 0 && versionsLoaded" class="text-gray-500 text-sm text-center py-3">
              {{ $t('admin.versionHistory.empty') }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="v in versions"
                :key="v.id"
                class="bg-slate-900/60 rounded-xl p-3 border border-slate-700"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-300 font-semibold">{{ v.editorName }}</span>
                  <span class="text-xs text-gray-500">{{ formatTimestamp(v.timestamp) }}</span>
                </div>
                <div v-if="v.reason" class="text-xs text-gray-400 italic mb-1.5">"{{ v.reason }}"</div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500">
                    {{ changedFieldLabels(v) }}
                  </span>
                  <button
                    v-if="isAdmin && !isStatusLocked(session)"
                    @click="handleRollback(v)"
                    class="text-xs text-amber-400 hover:text-amber-300 ml-2"
                  >
                    <i class="fas fa-undo mr-0.5"></i>{{ $t('admin.versionHistory.rollback') }}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </template>
      </template>

      <div v-else class="text-center py-12 text-gray-500">
        {{ $t('tournament.sessionNotFound') }}
      </div>
    </div>

    <!-- Diff preview modal -->
    <ConfigDiffPreview
      v-if="showDiff"
      :changes="diffChanges"
      :status-warning="isStatusWarning(session)"
      @confirm="handleConfirmSave"
      @cancel="showDiff = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useTablePermissions } from '../../composables/useTablePermissions.js';
import { useConfigEditor } from '../../composables/useConfigEditor.js';
import { useNotification } from '../../composables/useNotification.js';
import { DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL, DEFAULT_MAX_REENTRIES } from '../../utils/constants.js';
import ConfigDiffPreview from '../../components/admin/ConfigDiffPreview.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { isAdmin, permissionsLoaded, loadPermissions, canEdit, isStatusLocked, isStatusWarning } = useTablePermissions();
const { saving, saveTournamentConfig, getConfigVersions, rollbackToVersion } = useConfigEditor();

const sessionId = computed(() => route.params.sessionId);
const session = ref(null);
const loading = ref(true);
const versions = ref([]);
const versionsLoaded = ref(false);
const loadingVersions = ref(false);
const showDiff = ref(false);
const diffChanges = ref([]);

const canEditItem = computed(() => session.value && canEdit(session.value));

const form = ref({
  name: '',
  subtitle: '',
  buyIn: 0,
  startingChips: DEFAULT_STARTING_CHIPS,
  reentryUntilLevel: DEFAULT_REENTRY_LEVEL,
  maxReentries: DEFAULT_MAX_REENTRIES,
  levels: [],
  payoutRatios: [],
});

const payoutTotal = computed(() =>
  form.value.payoutRatios.reduce((sum, p) => sum + (p.percentage || 0), 0)
);

// ── Level management ─────────────────────────────────────────────────
function addLevel() {
  const levels = form.value.levels;
  const lastPlay = [...levels].reverse().find((l) => !l.isBreak);
  const nextLevelNum = lastPlay ? lastPlay.level + 1 : 1;
  levels.push({
    level: nextLevelNum,
    small: lastPlay ? Math.round(lastPlay.small * 1.5) : 25,
    big: lastPlay ? Math.round(lastPlay.big * 1.5) : 50,
    ante: lastPlay ? lastPlay.ante : 0,
    duration: lastPlay ? lastPlay.duration : 15,
    isBreak: false,
  });
  renumberLevels();
}

function addBreak() {
  form.value.levels.push({ level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true });
}

function removeLevel(idx) {
  form.value.levels.splice(idx, 1);
  renumberLevels();
}

function renumberLevels() {
  let num = 1;
  for (const lvl of form.value.levels) {
    if (!lvl.isBreak) lvl.level = num++;
  }
}

// ── Payout management ────────────────────────────────────────────────
function addPayout() {
  const next = form.value.payoutRatios.length + 1;
  form.value.payoutRatios.push({ place: next, percentage: 0 });
}

function removePayout(idx) {
  form.value.payoutRatios.splice(idx, 1);
  form.value.payoutRatios.forEach((p, i) => { p.place = i + 1; });
}

// ── Diff / save ──────────────────────────────────────────────────────
const RISKY_FIELDS_T = new Set(['buyIn', 'startingChips', 'payoutRatios', 'levels', 'reentryUntilLevel', 'maxReentries']);

function buildDiffChanges(before, after) {
  const changes = [];
  const fieldLabels = {
    name: t('tournament.tournamentName'),
    subtitle: t('tournament.subtitle'),
    buyIn: t('tournament.buyInAmount'),
    startingChips: t('tournament.startingChips'),
    reentryUntilLevel: t('tournament.reentryLevel'),
    maxReentries: t('tournament.maxReentries'),
    levels: t('tournament.blindStructure'),
    payoutRatios: t('tournament.payoutStructure'),
  };

  for (const key of Object.keys(fieldLabels)) {
    const bStr = JSON.stringify(before[key] ?? null);
    const aStr = JSON.stringify(after[key] ?? null);
    if (bStr !== aStr) {
      changes.push({
        field: key,
        label: fieldLabels[key],
        before: before[key],
        after: after[key],
        isRisky: RISKY_FIELDS_T.has(key),
        hint: key === 'payoutRatios' ? t('admin.diffPreview.payoutHint') : undefined,
      });
    }
  }
  return changes;
}

function validate() {
  if (!form.value.name?.trim()) {
    showError(t('tournament.nameRequired'));
    return false;
  }
  if (form.value.payoutRatios.length > 0 && payoutTotal.value !== 100) {
    showError(t('tournament.payoutMustBe100'));
    return false;
  }
  if (form.value.buyIn < 0) {
    showError(t('admin.validation.buyInNegative'));
    return false;
  }
  if (form.value.startingChips < 100) {
    showError(t('admin.validation.startingChipsMin'));
    return false;
  }
  return true;
}

function getFormAsConfig() {
  return {
    name: form.value.name,
    subtitle: form.value.subtitle,
    buyIn: form.value.buyIn,
    startingChips: form.value.startingChips,
    reentryUntilLevel: form.value.reentryUntilLevel,
    maxReentries: form.value.maxReentries,
    levels: form.value.levels.map((l) => ({ ...l })),
    payoutRatios: form.value.payoutRatios.map((p) => ({ ...p })),
  };
}

async function handleSaveClick() {
  if (!validate()) return;
  const before = session.value?.config || {};
  const after = getFormAsConfig();
  diffChanges.value = buildDiffChanges(before, after);
  showDiff.value = true;
}

async function handleConfirmSave(reason) {
  showDiff.value = false;
  const before = session.value?.config || {};
  const after = getFormAsConfig();
  try {
    await saveTournamentConfig(sessionId.value, after, before, reason);
    session.value.config = { ...after };
    success(t('common.save') + ' ✓');
    versionsLoaded.value = false;
    versions.value = [];
  } catch (e) {
    showError(e.message);
  }
}

async function handleRollback(version) {
  try {
    await rollbackToVersion('tournamentSessions', sessionId.value, version.id, `Rollback to ${formatTimestamp(version.timestamp)}`);
    success(t('admin.versionHistory.rollbackSuccess'));
    await loadSession();
    await loadVersions();
  } catch (e) {
    showError(e.message);
  }
}

// ── Data loading ─────────────────────────────────────────────────────
async function loadSession() {
  loading.value = true;
  try {
    const snap = await getDoc(doc(db, 'tournamentSessions', sessionId.value));
    if (snap.exists()) {
      session.value = { id: snap.id, ...snap.data() };
      const cfg = session.value.config || {};
      form.value = {
        name: cfg.name || '',
        subtitle: cfg.subtitle || '',
        buyIn: cfg.buyIn || 0,
        startingChips: cfg.startingChips || DEFAULT_STARTING_CHIPS,
        reentryUntilLevel: cfg.reentryUntilLevel ?? DEFAULT_REENTRY_LEVEL,
        maxReentries: cfg.maxReentries ?? DEFAULT_MAX_REENTRIES,
        levels: (cfg.levels || []).map((l) => ({ ...l })),
        payoutRatios: (cfg.payoutRatios || []).map((p) => ({ ...p })),
      };
    }
  } finally {
    loading.value = false;
  }
}

async function loadVersions() {
  loadingVersions.value = true;
  try {
    versions.value = await getConfigVersions('tournamentSessions', sessionId.value);
    versionsLoaded.value = true;
  } catch (e) {
    console.error('load versions error', e);
  } finally {
    loadingVersions.value = false;
  }
}

function changedFieldLabels(v) {
  if (!v.before || !v.after) return '';
  const labels = [];
  for (const key of Object.keys(v.after)) {
    if (JSON.stringify(v.before[key]) !== JSON.stringify(v.after[key])) {
      labels.push(key);
    }
  }
  return labels.join(', ');
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

function handleBack() {
  router.push('/admin/tables');
}

onMounted(async () => {
  await loadPermissions();
  await loadSession();
});
</script>

<style scoped>
.card {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
}
.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.75rem;
}
.field-label {
  display: block;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}
.field-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.9rem;
}
.field-input:focus {
  outline: none;
  border-color: #f59e0b;
}
.field-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.blind-grid {
  display: grid;
  grid-template-columns: 2rem 1fr 1fr 1fr 5rem 2rem;
  gap: 0.4rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.blind-grid.header {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 0.25rem;
}
.blind-grid.break-row {
  background: rgba(59, 130, 246, 0.08);
  border-radius: 0.375rem;
}
.break-row .col-span-3 { grid-column: span 3; }
.level-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 0.375rem;
  padding: 0.3rem 0.4rem;
  color: white;
  font-size: 0.8rem;
  text-align: center;
}
.level-input:focus {
  outline: none;
  border-color: #f59e0b;
}
.level-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.level-input::-webkit-inner-spin-button,
.level-input::-webkit-outer-spin-button { -webkit-appearance: none; }
</style>
