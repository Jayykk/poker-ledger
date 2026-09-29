<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.back()" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">
          {{ isEditing ? $t('cashPreset.editPreset') : $t('cashPreset.createPreset') }}
        </h1>
        <button
          @click="handleSave"
          :disabled="!canSave"
          class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <!-- Preset name -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">{{ $t('cashPreset.name') }}</label>
        <BaseInput
          v-model="form.name"
          :placeholder="$t('cashPreset.namePlaceholder')"
        />
      </div>

      <!-- Buy-in chips -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.buyIn') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.buyInHint') }}</span>
        </label>
        <div class="flex gap-2 items-center">
          <BaseButton @click="decrementBuyIn" size="sm">-{{ CHIP_STEP }}</BaseButton>
          <BaseInput
            v-model.number="form.buyIn"
            type="number"
            :min="MIN_BUY_IN"
            :step="CHIP_STEP"
            class="flex-1"
          />
          <BaseButton @click="incrementBuyIn" size="sm">+{{ CHIP_STEP }}</BaseButton>
          <span class="text-white text-sm">{{ $t('game.chips') }}</span>
        </div>
      </div>

      <!-- Settlement rate -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.rate') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.rateHint') }}</span>
        </label>
        <div class="flex gap-2 items-center">
          <span class="text-white text-sm">1 :</span>
          <BaseInput
            v-model.number="form.rate"
            type="number"
            min="0.001"
            step="0.1"
            class="flex-1"
          />
        </div>
      </div>

      <!-- Settlement rounding (zero-sum, see utils/cashRounding.js) -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.decimals') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.decimalsHint') }}</span>
        </label>
        <select
          v-model="form.cashDecimals"
          class="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option v-for="d in CASH_DECIMAL_OPTIONS" :key="String(d)" :value="d">{{ decimalsLabel(d) }}</option>
        </select>
      </div>

      <!-- Blind structure (optional): drives the clock, cutoff and end time -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.structure') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.structureHint') }}</span>
        </label>
        <select
          v-model="structureChoice"
          class="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">{{ $t('cashPreset.structureNone') }}</option>
          <option v-if="keepsOrphanSnapshot" :value="CURRENT_SNAPSHOT">{{ form.structure.name }}</option>
          <optgroup v-if="userStructures.length" :label="$t('tournament.myPresets')">
            <option v-for="p in userStructures" :key="p.id" :value="`user:${p.id}`">{{ p.name }}</option>
          </optgroup>
          <optgroup :label="$t('tournament.builtInTemplates')">
            <option v-for="tmpl in TOURNAMENT_TEMPLATES" :key="tmpl.id" :value="`builtin:${tmpl.id}`">{{ $t(tmpl.nameKey) }}</option>
          </optgroup>
        </select>
        <!-- Timed games decide the cutoff themselves (see withTimedCutoff) -->
        <div v-if="structureCutoff > 0" class="flex items-center gap-2">
          <span class="text-sm text-gray-300 flex-shrink-0">{{ $t('timed.cutoffLabel') }}</span>
          <select
            v-model="noCutoff"
            class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option :value="false">{{ $t('timed.followStructure', { level: structureCutoff }) }}</option>
            <option :value="true">{{ $t('timed.noCutoff') }}</option>
          </select>
        </div>
        <div v-if="structurePreview" class="text-xs text-gray-400 bg-slate-800/60 rounded-lg px-3 py-2">
          {{ $t('cashPreset.structureSummary', structurePreview) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useCashPresets } from '../composables/useCashPresets.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import BaseInput from '../components/common/BaseInput.vue';
import BaseButton from '../components/common/BaseButton.vue';
import { DEFAULT_BUY_IN, MIN_BUY_IN, CHIP_STEP } from '../utils/constants.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { snapshotStructure, withTimedCutoff, totalStructureSeconds, formatDuration } from '../utils/timedStructure.js';
import { CASH_DECIMAL_OPTIONS, normalizeCashDecimals } from '../utils/cashRounding.js';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { listenPresets, savePreset } = useCashPresets();
const { listenPresets: listenStructures } = useTournamentClock();

const presetId = computed(() => route.params.presetId || null);
const isEditing = computed(() => Boolean(presetId.value));

const form = ref({
  name: '',
  buyIn: DEFAULT_BUY_IN,
  rate: 1,
  cashDecimals: null,
  structure: null,
});

function decimalsLabel(d) {
  if (d === null) return t('cashPreset.decimalsNone');
  return d === 0 ? t('cashPreset.decimalsInteger') : t('cashPreset.decimalsN', { n: d });
}

// ── Blind structure ────────────────────────────────────
// The preset stores a snapshot of the chosen structure (see snapshotStructure).
// Picker values: '' = none, 'user:<id>' / 'builtin:<id>' = a source to
// (re-)snapshot on save, CURRENT_SNAPSHOT = keep the stored snapshot when its
// source was deleted.
const CURRENT_SNAPSHOT = '__current';
const userStructures = ref([]);
const structureChoice = ref('');
// true = no buy-in cutoff for this preset (only time-up closes buy-ins)
const noCutoff = ref(false);

function choiceFor(structure) {
  if (!structure) return '';
  const id = structure.sourceId;
  if (id && userStructures.value.some((p) => p.id === id)) return `user:${id}`;
  if (id && TOURNAMENT_TEMPLATES.some((tmpl) => tmpl.id === id)) return `builtin:${id}`;
  return CURRENT_SNAPSHOT;
}

const keepsOrphanSnapshot = computed(() =>
  Boolean(form.value.structure) && choiceFor(form.value.structure) === CURRENT_SNAPSHOT
);

/** Raw snapshot of the chosen structure, before the cutoff choice. */
function baseStructure() {
  const choice = structureChoice.value;
  if (!choice) return null;
  if (choice === CURRENT_SNAPSHOT) return form.value.structure;
  const [kind, id] = choice.split(':');
  if (kind === 'user') {
    const p = userStructures.value.find((x) => x.id === id);
    return p ? snapshotStructure(p, p.name) : null;
  }
  const tmpl = TOURNAMENT_TEMPLATES.find((x) => x.id === id);
  return tmpl ? snapshotStructure(tmpl, t(tmpl.nameKey)) : null;
}

/** Structure snapshot to store (null = none), with this preset's cutoff choice. */
function selectedStructure() {
  return withTimedCutoff(baseStructure(), noCutoff.value);
}

/** The chosen structure's own cutoff level (0 = it has none). */
const structureCutoff = computed(() => {
  const base = baseStructure();
  return base ? Number(base.sourceCutoff ?? base.reentryUntilLevel) || 0 : 0;
});

const structurePreview = computed(() => {
  const s = selectedStructure();
  if (!s) return null;
  return {
    levels: s.levels.filter((l) => !l.isBreak).length,
    duration: formatDuration(totalStructureSeconds(s.levels)),
    cutoff: s.reentryUntilLevel > 0 ? t('timed.cutoff', { level: s.reentryUntilLevel }) : t('timed.noCutoff'),
  };
});

const canSave = computed(() => {
  const buyIn = Number(form.value.buyIn);
  const rate = Number(form.value.rate);
  return (
    form.value.name.trim().length > 0 &&
    Number.isFinite(buyIn) &&
    buyIn >= MIN_BUY_IN &&
    Number.isFinite(rate) &&
    rate > 0
  );
});

let unsubPresets = null;
let unsubStructures = null;

onMounted(() => {
  unsubStructures = listenStructures((list) => {
    userStructures.value = list;
    // Re-resolve once the user's structures load (the stored snapshot's
    // source may be one of them).
    if (structureChoice.value === CURRENT_SNAPSHOT) {
      structureChoice.value = choiceFor(form.value.structure);
    }
  });

  if (!isEditing.value) return;
  // Load existing preset for editing.
  unsubPresets = listenPresets((presets) => {
    const found = presets.find((p) => p.id === presetId.value);
    if (found) {
      form.value = {
        name: found.name || '',
        buyIn: found.buyIn || DEFAULT_BUY_IN,
        rate: found.rate || 1,
        cashDecimals: normalizeCashDecimals(found.cashDecimals),
        structure: found.structure || null,
      };
      structureChoice.value = choiceFor(form.value.structure);
      noCutoff.value = Boolean(found.structure?.noCutoff);
    }
  });
});

onUnmounted(() => {
  if (unsubPresets) unsubPresets();
  if (unsubStructures) unsubStructures();
});

function incrementBuyIn() {
  form.value.buyIn = (Number(form.value.buyIn) || 0) + CHIP_STEP;
}

function decrementBuyIn() {
  const next = (Number(form.value.buyIn) || 0) - CHIP_STEP;
  form.value.buyIn = Math.max(MIN_BUY_IN, next);
}

async function handleSave() {
  if (!canSave.value) {
    showError(t('cashPreset.invalidInput'));
    return;
  }
  try {
    await savePreset(
      {
        name: form.value.name.trim(),
        buyIn: Number(form.value.buyIn),
        rate: Number(form.value.rate),
        cashDecimals: normalizeCashDecimals(form.value.cashDecimals),
        // Re-snapshotted on every save so edits to the source structure are
        // picked up; null clears it (setDoc merge overwrites the field).
        structure: selectedStructure(),
      },
      presetId.value
    );
    success(t('common.save') + ' ✓');
    router.push('/cash-presets');
  } catch (e) {
    showError(e.message);
  }
}
</script>
