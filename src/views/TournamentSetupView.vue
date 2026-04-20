<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="handleBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">
          {{ isEditing ? $t('tournament.editPreset') : $t('tournament.createPreset') }}
        </h1>
        <button
          @click="handleSave"
          class="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold transition"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-6">
      <!-- Basic Info -->
      <section class="card">
        <h2 class="section-title">{{ $t('tournament.basicInfo') }}</h2>
        <div class="space-y-3">
          <div>
            <label class="field-label">{{ $t('tournament.tournamentName') }}</label>
            <input v-model="form.name" type="text" class="field-input" :placeholder="$t('tournament.namePlaceholder')" />
          </div>
          <div>
            <label class="field-label">{{ $t('tournament.subtitle') }}</label>
            <input v-model="form.subtitle" type="text" class="field-input" :placeholder="$t('tournament.subtitlePlaceholder')" />
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="field-label">{{ $t('tournament.buyInAmount') }}</label>
              <input v-model.number="form.buyIn" type="number" min="0" class="field-input" />
            </div>
            <div>
              <label class="field-label">{{ $t('tournament.startingChips') }}</label>
              <input v-model.number="form.startingChips" type="number" min="1000" step="1000" class="field-input" />
            </div>
            <div>
              <label class="field-label">{{ $t('tournament.reentryLevel') }}</label>
              <input v-model.number="form.reentryUntilLevel" type="number" min="0" class="field-input" />
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label class="field-label">{{ $t('tournament.maxReentries') }}</label>
              <input v-model.number="form.maxReentries" type="number" min="0" class="field-input" :placeholder="$t('tournament.unlimited')" />
              <span class="text-[10px] text-gray-500">{{ $t('tournament.maxReentriesHint') }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Blind Structure -->
      <section class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="section-title mb-0">{{ $t('tournament.blindStructure') }}</h2>
          <div class="flex gap-2">
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
          <span class="text-gray-400 text-sm self-center">
            {{ lvl.isBreak ? '☕' : lvl.level }}
          </span>
          <template v-if="lvl.isBreak">
            <span class="col-span-3 text-blue-300 text-sm self-center text-center">
              {{ $t('tournament.breakTime') }}
            </span>
          </template>
          <template v-else>
            <input v-model.number="lvl.small" type="number" min="0" class="level-input" />
            <input v-model.number="lvl.big" type="number" min="0" class="level-input" />
            <input v-model.number="lvl.ante" type="number" min="0" class="level-input" />
          </template>
          <div class="flex items-center gap-1">
            <input v-model.number="lvl.duration" type="number" min="1" class="level-input w-14" />
            <span class="text-gray-500 text-xs">min</span>
          </div>
          <button @click="removeLevel(idx)" class="text-red-400 hover:text-red-300">
            <i class="fas fa-trash-alt text-sm"></i>
          </button>
        </div>
      </section>

      <!-- Payout Structure -->
      <section class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="section-title mb-0">{{ $t('tournament.payoutStructure') }}</h2>
          <button @click="addPayout" class="text-sm text-emerald-400 hover:text-emerald-300">
            <i class="fas fa-plus mr-1"></i>{{ $t('tournament.addPlace') }}
          </button>
        </div>

        <div class="space-y-2">
          <div v-for="(p, idx) in form.payoutRatios" :key="idx" class="flex items-center gap-3">
            <span class="text-gray-400 text-sm w-8">{{ p.place }}.</span>
            <div class="flex items-center gap-1 flex-1">
              <input
                v-model.number="p.percentage"
                type="number"
                min="0"
                max="100"
                class="level-input flex-1"
              />
              <span class="text-gray-400 text-sm">%</span>
            </div>
            <button @click="removePayout(idx)" class="text-red-400 hover:text-red-300">
              <i class="fas fa-trash-alt text-sm"></i>
            </button>
          </div>
          <div class="text-right text-sm" :class="payoutTotal === 100 ? 'text-emerald-400' : 'text-red-400'">
            {{ $t('tournament.total') }}: {{ payoutTotal }}%
          </div>
        </div>
      </section>

      <!-- Share / Import -->
      <section class="card">
        <h2 class="section-title">{{ $t('tournament.shareImport') }}</h2>
        <div class="flex gap-2">
          <button @click="shareByLink" class="ctrl-btn bg-amber-600 hover:bg-amber-500 flex-1">
            <i class="fas fa-link mr-1"></i>{{ $t('tournament.copyLink') }}
          </button>
          <button @click="shareByLine" class="ctrl-btn bg-emerald-600 hover:bg-emerald-500 flex-1">
            <i class="fab fa-line mr-1"></i>LINE
          </button>
        </div>
        <div class="flex gap-2 mt-2">
          <button @click="exportConfig" class="ctrl-btn bg-slate-600 hover:bg-slate-500 flex-1">
            <i class="fas fa-download mr-1"></i>{{ $t('common.export') }}
          </button>
          <label class="ctrl-btn bg-slate-600 hover:bg-slate-500 flex-1 cursor-pointer text-center">
            <i class="fas fa-upload mr-1"></i>{{ $t('tournament.import') }}
            <input type="file" accept=".json" class="hidden" @change="importConfig" />
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { TOURNAMENT_TEMPLATES, createBlankTournamentConfig, cloneTemplate } from '../utils/tournamentTemplates.js';
import { DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL, DEFAULT_MAX_REENTRIES } from '../utils/constants.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { savePreset, listenPresets } = useTournamentClock();

const isEditing = computed(() => !!route.params.presetId);

const form = ref(createBlankTournamentConfig());

// Load preset if editing
onMounted(() => {
  const presetId = route.params.presetId;
  const templateId = route.query.template;
  const sharedPreset = route.query.preset;

  // Import from shared link
  if (sharedPreset) {
    const decoded = decodePresetFromBase64(sharedPreset);
    if (decoded) {
      form.value = decoded;
      success(t('tournament.importSuccess'));
    } else {
      showError(t('tournament.invalidFormat'));
    }
  }

  if (templateId) {
    const tmpl = TOURNAMENT_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      form.value = cloneTemplate(tmpl);
    }
  }

  if (presetId) {
    // Listen for this specific preset via the general listener
    const unsub = listenPresets((presets) => {
      const found = presets.find((p) => p.id === presetId);
      if (found) {
        form.value = {
          name: found.name || '',
          subtitle: found.subtitle || '',
          buyIn: found.buyIn || 0,
          startingChips: found.startingChips || DEFAULT_STARTING_CHIPS,
          reentryUntilLevel: found.reentryUntilLevel || DEFAULT_REENTRY_LEVEL,
          maxReentries: found.maxReentries ?? DEFAULT_MAX_REENTRIES,
          levels: found.levels || [],
          payoutRatios: found.payoutRatios || [],
        };
      }
      unsub(); // Only need one read
    });
  }
});

const payoutTotal = computed(() => {
  return form.value.payoutRatios.reduce((sum, p) => sum + (p.percentage || 0), 0);
});

// ── Level management ────────────────────────────────
function addLevel() {
  const levels = form.value.levels;
  const lastPlay = [...levels].reverse().find((l) => !l.isBreak);
  const nextLevelNum = lastPlay ? lastPlay.level + 1 : 1;

  levels.push({
    level: nextLevelNum,
    small: lastPlay ? lastPlay.small * 1.5 : 25,
    big: lastPlay ? lastPlay.big * 1.5 : 50,
    ante: lastPlay ? lastPlay.ante : 0,
    duration: lastPlay ? lastPlay.duration : 15,
    isBreak: false,
  });

  renumberLevels();
}

function addBreak() {
  form.value.levels.push({
    level: 0,
    small: 0,
    big: 0,
    ante: 0,
    duration: 10,
    isBreak: true,
  });
}

function removeLevel(idx) {
  form.value.levels.splice(idx, 1);
  renumberLevels();
}

function renumberLevels() {
  let num = 1;
  for (const lvl of form.value.levels) {
    if (!lvl.isBreak) {
      lvl.level = num++;
    }
  }
}

// ── Payout management ────────────────────────────────
function addPayout() {
  const next = form.value.payoutRatios.length + 1;
  form.value.payoutRatios.push({ place: next, percentage: 0 });
}

function removePayout(idx) {
  form.value.payoutRatios.splice(idx, 1);
  // Renumber
  form.value.payoutRatios.forEach((p, i) => { p.place = i + 1; });
}

// ── Save ─────────────────────────────────────────────
async function handleSave() {
  if (!form.value.name?.trim()) {
    showError(t('tournament.nameRequired'));
    return;
  }
  if (payoutTotal.value !== 100) {
    showError(t('tournament.payoutMustBe100'));
    return;
  }

  try {
    const presetId = route.params.presetId || null;
    await savePreset(form.value, presetId);
    success(t('common.save') + ' ✓');
    router.push('/tournament-presets');
  } catch (e) {
    showError(e.message);
  }
}

function handleBack() {
  router.push('/tournament-presets');
}

// ── Import / Export / Share ───────────────────────────
function encodePresetToBase64(data) {
  // Compact the data to reduce URL length
  const compact = {
    n: data.name,
    s: data.subtitle,
    b: data.buyIn,
    c: data.startingChips,
    r: data.reentryUntilLevel,
    m: data.maxReentries || 0,
    l: data.levels.map(lv => lv.isBreak
      ? [0, 0, 0, 0, lv.duration, 1]
      : [lv.level, lv.small, lv.big, lv.ante, lv.duration, 0]
    ),
    p: data.payoutRatios.map(pr => [pr.place, pr.percentage]),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

function decodePresetFromBase64(b64) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const c = JSON.parse(json);
    return {
      name: c.n || '',
      subtitle: c.s || '',
      buyIn: c.b || 0,
      startingChips: c.c || DEFAULT_STARTING_CHIPS,
      reentryUntilLevel: c.r || DEFAULT_REENTRY_LEVEL,
      maxReentries: c.m ?? DEFAULT_MAX_REENTRIES,
      levels: (c.l || []).map(lv => ({
        level: lv[0], small: lv[1], big: lv[2], ante: lv[3],
        duration: lv[4], isBreak: !!lv[5],
      })),
      payoutRatios: (c.p || []).map(pr => ({ place: pr[0], percentage: pr[1] })),
    };
  } catch {
    return null;
  }
}

function shareByLink() {
  const encoded = encodePresetToBase64(form.value);
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}#/tournament-setup?preset=${encoded}`;

  navigator.clipboard.writeText(shareUrl).then(() => {
    success(t('common.copySuccess'));
  }).catch(() => {
    // Fallback
    showError(t('common.copyFailed'));
  });
}

function shareByLine() {
  const encoded = encodePresetToBase64(form.value);
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}#/tournament-setup?preset=${encoded}`;
  const text = `🏆 ${form.value.name || 'Tournament'}\n${t('tournament.buyInAmount')}: ${form.value.buyIn}`;

  // Use LINE share URL scheme
  const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
  window.open(lineShareUrl, '_blank');
}

function exportConfig() {
  const data = JSON.stringify(form.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${form.value.name || 'tournament'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importConfig(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.levels && Array.isArray(data.levels)) {
        form.value = {
          name: data.name || '',
          subtitle: data.subtitle || '',
          buyIn: data.buyIn || 0,
          startingChips: data.startingChips || DEFAULT_STARTING_CHIPS,
          reentryUntilLevel: data.reentryUntilLevel || DEFAULT_REENTRY_LEVEL,
          levels: data.levels,
          payoutRatios: data.payoutRatios || [],
        };
        success(t('tournament.importSuccess'));
      } else {
        showError(t('tournament.invalidFormat'));
      }
    } catch {
      showError(t('tournament.invalidFormat'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
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

.break-row .col-span-3 {
  grid-column: span 3;
}

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

.level-input::-webkit-inner-spin-button,
.level-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
</style>
