<template>
  <div class="min-h-screen bg-slate-900 text-white pb-nav">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="goBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">
          {{ isEditing ? $t('template.edit') : $t('template.create') }}
        </h1>
        <button
          @click="handleSave"
          :disabled="saving"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-40"
          :class="isCash ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <!-- Kind + name -->
      <section class="card space-y-3">
        <div v-if="!isEditing" class="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl">
          <button
            v-for="k in KINDS"
            :key="k"
            type="button"
            @click="setKind(k)"
            class="py-2 rounded-lg text-sm font-semibold transition"
            :class="form.kind === k ? (k === 'cash' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white') : 'text-gray-400 hover:text-white'"
          >
            {{ k === 'cash' ? '💵 ' + $t('template.kindCash') : '🏆 ' + $t('template.kindTournament') }}
          </button>
        </div>
        <div v-else class="text-sm font-semibold" :class="isCash ? 'text-emerald-400' : 'text-amber-400'">
          {{ isCash ? '💵 ' + $t('template.kindCash') : '🏆 ' + $t('template.kindTournament') }}
        </div>
        <div>
          <label class="field-label">{{ $t('template.name') }}</label>
          <input v-model="form.name" type="text" class="field-input"
                 :placeholder="isCash ? $t('cashPreset.namePlaceholder') : $t('tournament.namePlaceholder')" />
        </div>
        <div v-if="!isCash">
          <label class="field-label">{{ $t('tournament.subtitle') }}</label>
          <input v-model="form.subtitle" type="text" class="field-input" :placeholder="$t('tournament.subtitlePlaceholder')" />
        </div>
      </section>

      <!-- Module: buy-in -->
      <section class="card space-y-3">
        <h2 class="section-title"><i class="fas fa-coins mr-2 text-amber-400"></i>{{ $t('template.moduleBuyIn') }}</h2>
        <template v-if="isCash">
          <div>
            <label class="field-label">{{ $t('cashPreset.buyIn') }}</label>
            <div class="flex gap-2 items-center">
              <button type="button" class="step-btn" @click="stepChips(-1)">-{{ CHIP_STEP }}</button>
              <input v-model.number="form.chips" type="number" :min="MIN_BUY_IN" :step="CHIP_STEP" class="field-input flex-1" />
              <button type="button" class="step-btn" @click="stepChips(1)">+{{ CHIP_STEP }}</button>
            </div>
          </div>
          <div>
            <label class="field-label">{{ $t('cashPreset.buyInAmount') }} · {{ $t('cashPreset.buyInAmountHint', { chips: form.chips || 0 }) }}</label>
            <div class="flex gap-2 items-center">
              <span class="text-white text-sm">$</span>
              <input v-model.number="form.amount" type="number" min="0.01" step="1" class="field-input flex-1" />
            </div>
            <p class="hint">
              {{ $t('cashPreset.rate') }}:
              {{ derivedRate ? $t('cashPreset.rateDerived', { rate: formatRate(derivedRate) }) : '-' }}
            </p>
          </div>
        </template>
        <div v-else class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">{{ $t('tournament.buyInAmount') }}</label>
            <input v-model.number="form.amount" type="number" min="0" class="field-input" />
          </div>
          <div>
            <label class="field-label">{{ $t('tournament.startingChips') }}</label>
            <input v-model.number="form.chips" type="number" min="1000" step="1000" class="field-input" />
          </div>
        </div>
      </section>

      <!-- Module: blind structure -->
      <section class="card space-y-2">
        <h2 class="section-title"><i class="fas fa-layer-group mr-2 text-sky-400"></i>{{ $t('template.moduleStructure') }}</h2>
        <p class="hint">{{ isCash ? $t('cashPreset.structureHint') : $t('template.structureRequiredHint') }}</p>
        <select v-model="structureChoice" class="field-input" @change="onStructurePicked">
          <option v-if="isCash" value="">{{ $t('cashPreset.structureNone') }}</option>
          <option v-else value="" disabled>{{ $t('template.pickStructure') }}</option>
          <option v-if="form.structure && orphan" :value="CURRENT">{{ form.structure.name || $t('cashPreset.untitled') }}</option>
          <optgroup v-if="libraryMine.length" :label="$t('structure.mine')">
            <option v-for="s in libraryMine" :key="choiceKey(s)" :value="choiceKey(s)">{{ s.name || $t('cashPreset.untitled') }}</option>
          </optgroup>
          <optgroup :label="$t('tournament.builtInTemplates')">
            <option v-for="s in libraryBuiltIn" :key="choiceKey(s)" :value="choiceKey(s)">{{ s.name }}</option>
          </optgroup>
        </select>
        <p v-if="form.structure" class="hint">{{ structureLine }}</p>
        <button type="button" class="text-xs text-sky-400 hover:text-sky-300" @click="$router.push('/structures')">
          <i class="fas fa-pen mr-1"></i>{{ $t('template.manageStructures') }}
        </button>
      </section>

      <!-- Module: entry (cutoff / re-entry) -->
      <section v-if="!isCash || form.structure" class="card space-y-3">
        <h2 class="section-title"><i class="fas fa-door-open mr-2 text-rose-400"></i>{{ $t('template.moduleEntry') }}</h2>
        <template v-if="isCash">
          <div>
            <label class="field-label">{{ $t('timed.cutoffLabel') }}</label>
            <select v-model="form.cutoffLevel" class="field-input">
              <option :value="null">{{ $t('timed.noCutoff') }}</option>
              <option v-for="n in maxLevel" :key="n" :value="n">{{ $t('timed.cutoff', { level: n }) }}</option>
            </select>
          </div>
        </template>
        <template v-else>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.reentryAllowed" type="checkbox" class="w-4 h-4 accent-amber-500" />
            {{ $t('template.reentryAllowed') }}
          </label>
          <div v-if="form.reentryAllowed" class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label">{{ $t('tournament.reentryLevel') }}</label>
              <select v-model="form.cutoffLevel" class="field-input">
                <option :value="null">{{ $t('template.reentryNoCutoff') }}</option>
                <option v-for="n in maxLevel" :key="n" :value="n">{{ $t('timed.cutoff', { level: n }) }}</option>
              </select>
            </div>
            <div>
              <label class="field-label">{{ $t('tournament.maxReentries') }}</label>
              <input v-model="form.reentryMax" type="number" min="1" class="field-input" :placeholder="$t('tournament.unlimited')" />
            </div>
          </div>
        </template>
      </section>

      <!-- Module: settlement -->
      <section class="card space-y-2">
        <h2 class="section-title"><i class="fas fa-calculator mr-2 text-emerald-400"></i>{{ $t('template.moduleSettlement') }}</h2>
        <template v-if="isCash">
          <label class="field-label">{{ $t('cashPreset.decimals') }}</label>
          <select v-model="form.decimals" class="field-input">
            <option v-for="d in CASH_DECIMAL_OPTIONS" :key="String(d)" :value="d">{{ decimalsLabel(d) }}</option>
          </select>
          <p class="hint">{{ $t('cashPreset.decimalsHint') }}</p>
        </template>
        <template v-else>
          <div class="flex items-center justify-between">
            <span class="field-label mb-0">{{ $t('tournament.payoutStructure') }}</span>
            <button type="button" @click="addPayout" class="text-sm text-emerald-400 hover:text-emerald-300">
              <i class="fas fa-plus mr-1"></i>{{ $t('tournament.addPlace') }}
            </button>
          </div>
          <div v-for="(p, idx) in form.payout" :key="idx" class="flex items-center gap-3">
            <span class="text-gray-400 text-sm w-8">{{ p.place }}.</span>
            <input v-model.number="p.percentage" type="number" min="0" max="100" class="field-input flex-1" />
            <span class="text-gray-400 text-sm">%</span>
            <button type="button" @click="removePayout(idx)" class="text-red-400 hover:text-red-300">
              <i class="fas fa-trash-alt text-sm"></i>
            </button>
          </div>
          <div class="text-right text-sm" :class="payoutTotal === 100 ? 'text-emerald-400' : 'text-red-400'">
            {{ $t('tournament.total') }}: {{ payoutTotal }}%
          </div>
        </template>
      </section>

      <!-- Module: bounty (tournament; phase 2) -->
      <section v-if="!isCash" class="card space-y-2">
        <h2 class="section-title"><i class="fas fa-crosshairs mr-2 text-red-400"></i>{{ $t('template.moduleBounty') }}</h2>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="b in BOUNTY_TYPES"
            :key="b"
            type="button"
            :disabled="!isBountyPlayable({ type: b })"
            @click="form.bountyType = b"
            class="bounty-opt"
            :class="{ active: form.bountyType === b }"
          >
            <span class="font-semibold">{{ $t(`template.bounty.${b}`) }}</span>
            <span v-if="!isBountyPlayable({ type: b })" class="soon">{{ $t('template.comingSoon') }}</span>
          </button>
        </div>
        <!-- KO: how much of each buy-in goes on the player's head -->
        <div v-if="form.bountyType === 'ko' || form.bountyType === 'pko' || form.bountyType === 'mystery'" class="space-y-2 pt-1">
          <label class="field-label">{{ $t(form.bountyType === 'mystery' ? 'mystery.sharePerEntry' : 'bounty.sharePerEntry') }}</label>
          <div class="flex gap-2">
            <select v-model="form.bountyMode" class="field-input flex-shrink-0" style="width: 8.5rem">
              <option value="percent">{{ $t('bounty.modePercent') }}</option>
              <option value="amount">{{ $t('bounty.modeAmount') }}</option>
            </select>
            <input v-model.number="form.bountyValue" type="number" min="0" class="field-input flex-1 min-w-0" style="width: auto" />
            <span class="text-gray-400 text-sm self-center">{{ form.bountyMode === 'percent' ? '%' : '$' }}</span>
          </div>
          <p class="hint">
            {{ $t(form.bountyType === 'mystery' ? 'mystery.splitPreview' : 'bounty.splitPreview', { head: formatNumber(headPreview), pool: formatNumber(Math.max(0, (Number(form.amount) || 0) - headPreview)) }) }}
          </p>
          <!-- PKO: how much of a collected head is paid in cash (the rest grows your own head) -->
          <!-- Mystery: envelopes, when the draws start, how they're drawn -->
          <template v-if="form.bountyType === 'mystery'">
            <label class="field-label">{{ $t('mystery.envelopes') }}</label>
            <EnvelopeEditor v-model:envelopes="form.mysteryEnvelopes" />
            <label class="field-label">{{ $t('mystery.start') }}</label>
            <div class="flex gap-2">
              <select v-model="form.mysteryStartMode" class="field-input flex-shrink-0" style="width: 9.5rem">
                <option value="players">{{ $t('mystery.startPlayers') }}</option>
                <option value="level">{{ $t('mystery.startLevel') }}</option>
                <option value="cutoff">{{ $t('mystery.startCutoff') }}</option>
              </select>
              <input
                v-if="form.mysteryStartMode !== 'cutoff'"
                v-model.number="form.mysteryStartValue"
                type="number"
                min="1"
                class="field-input flex-1 min-w-0"
                style="width: auto"
              />
            </div>
            <label class="field-label">{{ $t('mystery.drawMode') }}</label>
            <select v-model="form.mysteryDrawMode" class="field-input">
              <option value="system">{{ $t('mystery.drawSystem') }}</option>
              <option value="manual">{{ $t('mystery.drawManual') }}</option>
            </select>
            <p class="hint">{{ $t('mystery.rulesHint') }}</p>
            <p v-if="mysteryWarning" class="hint text-amber-400">⚠️ {{ mysteryWarning }}</p>
          </template>
          <template v-if="form.bountyType === 'pko'">
            <label class="field-label">{{ $t('bounty.cashShare') }}</label>
            <div class="flex gap-2 items-center">
              <input v-model.number="form.bountyCashShare" type="number" min="0" max="100" step="5" class="field-input flex-1 min-w-0" style="width: auto" />
              <span class="text-gray-400 text-sm">%</span>
            </div>
            <p class="hint">{{ $t('bounty.cashSharePreview', { cash: formatNumber(Math.round(headPreview * pkoShare)), grow: formatNumber(headPreview - Math.round(headPreview * pkoShare)) }) }}</p>
          </template>
        </div>
        <p v-if="form.bountyType !== 'mystery'" class="hint">{{ form.bountyType === 'ko' ? $t('bounty.koHint') : form.bountyType === 'pko' ? $t('bounty.pkoHint') : $t('template.bountyHint') }}</p>
      </section>

      <!-- Share / import -->
      <section class="card space-y-2">
        <h2 class="section-title">{{ $t('tournament.shareImport') }}</h2>
        <div class="flex gap-2">
          <button type="button" @click="shareByLink" class="ctrl-btn text-white bg-amber-600 hover:bg-amber-500 flex-1">
            <i class="fas fa-link mr-1"></i>{{ $t('tournament.copyLink') }}
          </button>
          <button type="button" @click="shareByLine" class="ctrl-btn text-white bg-emerald-600 hover:bg-emerald-500 flex-1">
            <i class="fab fa-line mr-1"></i>LINE
          </button>
        </div>
        <div class="flex gap-2">
          <button type="button" @click="exportConfig" class="ctrl-btn bg-slate-600 hover:bg-slate-500 flex-1">
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
// Edit one table template as module cards (utils/tableTemplates.js).
//   /template-setup?kind=cash|tournament   new
//   /template-setup?builtin=<id>           new, copied from a built-in tournament
//   /template-setup?preset=<share>         new, from a share link
//   /template-setup/:templateId            stored template (?source=cashPresets |
//                                          tournamentPresets for a legacy preset —
//                                          saving turns it into a template)
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTableTemplates } from '../composables/useTableTemplates.js';
import { useNotification } from '../composables/useNotification.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { MIN_BUY_IN, CHIP_STEP } from '../utils/constants.js';
import { CASH_DECIMAL_OPTIONS } from '../utils/cashRounding.js';
import { rateFromBuyIn, formatRate } from '../utils/buyInRate.js';
import {
  TEMPLATE_KIND, TEMPLATE_KINDS, BOUNTY_TYPES, BUILT_IN_PREFIX,
  normalizeTemplate, validateTemplate, isBountyPlayable, maxLevelNumber,
  structureSnapshot, builtInStructures, templateFromBuiltInTournament,
  encodeTemplateShare, decodeTemplateShare, templateFromImport, bountyPerEntry,
} from '../utils/tableTemplates.js';
import { formatNumber } from '../utils/formatters.js';
import EnvelopeEditor from '../components/templates/EnvelopeEditor.vue';
import { suggestEnvelopes } from '../utils/bounty.js';
import { structureSummary } from '../utils/templateDisplay.js';

const KINDS = TEMPLATE_KINDS;
const CURRENT = '__current';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { listenTemplates, listenStructures, saveTemplate } = useTableTemplates();

const templateId = computed(() => route.params.templateId || null);
const source = computed(() => route.query.source || 'template');
const isEditing = computed(() => Boolean(templateId.value));

// ── form <-> template ─────────────────────────────────
function formFrom(raw) {
  const tpl = normalizeTemplate(raw);
  const cash = tpl.kind === TEMPLATE_KIND.CASH;
  return {
    kind: tpl.kind,
    name: tpl.name,
    subtitle: tpl.subtitle || '',
    chips: tpl.buyIn.chips,
    amount: tpl.buyIn.amount,
    structure: tpl.structure,
    cutoffLevel: tpl.entry.cutoffLevel,
    reentryAllowed: cash ? true : tpl.entry.reentry.allowed,
    reentryMax: cash ? '' : (tpl.entry.reentry.max ?? ''),
    decimals: cash ? tpl.cash.decimals : null,
    payout: cash ? [] : tpl.payout.ratios.map((r) => ({ ...r })),
    bountyType: cash ? 'none' : tpl.bounty.type,
    bounty: cash ? { type: 'none' } : tpl.bounty,
    bountyMode: tpl.bounty?.share?.mode || 'percent',
    bountyValue: tpl.bounty?.share?.value ?? 50,
    bountyCashShare: Math.round((tpl.bounty?.cashShare ?? 0.5) * 100),
    mysteryEnvelopes: (tpl.bounty?.envelopes?.length ? tpl.bounty.envelopes : suggestEnvelopes(9)).map((e) => ({ ...e })),
    mysteryStartMode: tpl.bounty?.start?.mode || 'players',
    mysteryStartValue: tpl.bounty?.start?.value || 9,
    mysteryDrawMode: tpl.bounty?.drawMode || 'system',
    migratedFrom: tpl.migratedFrom || null,
  };
}

function templateFrom(f) {
  return normalizeTemplate({
    kind: f.kind,
    name: f.name,
    subtitle: f.subtitle,
    buyIn: { chips: f.chips, amount: f.amount },
    structure: f.structure,
    entry: { cutoffLevel: f.cutoffLevel, reentry: { allowed: f.reentryAllowed, max: f.reentryMax } },
    cash: { decimals: f.decimals },
    payout: { ratios: f.payout },
    bounty: f.bountyType === 'none'
      ? { type: 'none' }
      : {
        ...(f.bountyType === f.bounty?.type ? f.bounty : {}),
        type: f.bountyType,
        share: { mode: f.bountyMode, value: f.bountyValue },
        ...(f.bountyType === 'pko' ? { cashShare: (Number(f.bountyCashShare) || 0) / 100 } : {}),
        ...(f.bountyType === 'mystery' ? {
          envelopes: f.mysteryEnvelopes,
          start: { mode: f.mysteryStartMode, value: f.mysteryStartValue },
          drawMode: f.mysteryDrawMode,
        } : {}),
      },
    migratedFrom: f.migratedFrom,
  });
}

const defaultPayout = () => [
  { place: 1, percentage: 50 },
  { place: 2, percentage: 30 },
  { place: 3, percentage: 20 },
];

const newForm = (kind) => formFrom({
  kind,
  payout: kind === TEMPLATE_KIND.TOURNAMENT ? { ratios: defaultPayout() } : undefined,
});

const form = ref(newForm(KINDS.includes(route.query.kind) ? route.query.kind : TEMPLATE_KIND.CASH));
const isCash = computed(() => form.value.kind === TEMPLATE_KIND.CASH);
const saving = ref(false);

function setKind(k) {
  if (form.value.kind === k) return;
  const next = newForm(k);
  // Keep what carries over between kinds
  next.name = form.value.name;
  next.structure = form.value.structure;
  next.cutoffLevel = form.value.cutoffLevel;
  form.value = next;
  if (k === TEMPLATE_KIND.TOURNAMENT && !form.value.structure) structureChoice.value = '';
}

// ── buy-in ────────────────────────────────────────────
const derivedRate = computed(() => rateFromBuyIn(form.value.chips, form.value.amount));
function stepChips(dir) {
  const next = (Number(form.value.chips) || 0) + dir * CHIP_STEP;
  form.value.chips = Math.max(MIN_BUY_IN, next);
}

// ── blind structure ───────────────────────────────────
// Picker value: '' = none, '<source>:<id>' = a library structure (snapshot
// taken when picked, and again on save so edits to it are picked up),
// CURRENT = keep the template's own snapshot (its source is gone).
const library = ref([]);
const libraryMine = computed(() => library.value);
const libraryBuiltIn = computed(() => builtInStructures(TOURNAMENT_TEMPLATES, t));
const choiceKey = (s) => `${s.source}:${s.id}`;
const structureChoice = ref('');

function findLibrary(choice) {
  if (!choice || choice === CURRENT) return null;
  return [...libraryMine.value, ...libraryBuiltIn.value].find((s) => choiceKey(s) === choice) || null;
}

/** Library item a stored snapshot came from (legacy cash snapshots use the raw built-in id). */
function choiceForSnapshot(snapshot) {
  if (!snapshot) return '';
  const id = snapshot.sourceId;
  const all = [...libraryMine.value, ...libraryBuiltIn.value];
  const found = id && (
    all.find((s) => s.id === id)
    || all.find((s) => s.id === `${BUILT_IN_PREFIX}${id}`)
    // a legacy preset's structure that has since been saved on its own
    || all.find((s) => s.migratedFrom && s.migratedFrom.endsWith(`/${id}`))
  );
  return found ? choiceKey(found) : CURRENT;
}

const orphan = computed(() => structureChoice.value === CURRENT);
const maxLevel = computed(() => maxLevelNumber(form.value.structure?.levels));
const structureLine = computed(() => structureSummary(form.value.structure, t));

function onStructurePicked() {
  const choice = structureChoice.value;
  if (choice === CURRENT) return;
  const item = findLibrary(choice);
  form.value.structure = item ? structureSnapshot(item) : null;
  // The structure's own cutoff is the suggestion; still editable below.
  form.value.cutoffLevel = item ? item.cutoffLevel : null;
}

watch(maxLevel, (max) => {
  if (form.value.cutoffLevel && form.value.cutoffLevel > max) form.value.cutoffLevel = null;
});

// ── bounty ────────────────────────────────────────────
// Mystery: say what happens when the envelopes and the start don't line up
const mysteryWarning = computed(() => {
  if (form.value.bountyType !== 'mystery') return '';
  const n = form.value.mysteryEnvelopes.reduce((sum, e) => sum + (Math.floor(Number(e.count)) || 0), 0);
  if (form.value.mysteryStartMode === 'players' && Number(form.value.mysteryStartValue) < n) {
    return t('mystery.warnMoreEnvelopes', { n, start: form.value.mysteryStartValue });
  }
  if (form.value.reentryAllowed || form.value.mysteryStartMode !== 'players') {
    return t('mystery.warnLeftover');
  }
  return '';
});
const pkoShare = computed(() => Math.min(1, Math.max(0, (Number(form.value.bountyCashShare) || 0) / 100)));
const headPreview = computed(() => bountyPerEntry(
  { type: form.value.bountyType, share: { mode: form.value.bountyMode, value: form.value.bountyValue } },
  form.value.amount,
));

// ── settlement ────────────────────────────────────────
function decimalsLabel(d) {
  if (d === null) return t('cashPreset.decimalsNone');
  return d === 0 ? t('cashPreset.decimalsInteger') : t('cashPreset.decimalsN', { n: d });
}
const payoutTotal = computed(() => form.value.payout.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0));
function addPayout() {
  form.value.payout.push({ place: form.value.payout.length + 1, percentage: 0 });
}
function removePayout(idx) {
  form.value.payout.splice(idx, 1);
  form.value.payout.forEach((p, i) => { p.place = i + 1; });
}

// ── load ──────────────────────────────────────────────
let unsubTemplates = null;
let unsubStructures = null;
let structuresLoaded = false;

function applyLoaded(raw) {
  form.value = formFrom(raw);
  if (structuresLoaded) structureChoice.value = choiceForSnapshot(form.value.structure);
}

onMounted(() => {
  unsubStructures = listenStructures((list) => {
    library.value = list;
    if (!structuresLoaded) {
      structuresLoaded = true;
      structureChoice.value = choiceForSnapshot(form.value.structure);
    }
  });

  if (route.query.builtin) {
    const b = TOURNAMENT_TEMPLATES.find((x) => `${BUILT_IN_PREFIX}${x.id}` === route.query.builtin);
    if (b) applyLoaded({ ...templateFromBuiltInTournament(b, t), id: null });
  }
  if (route.query.preset) {
    const shared = decodeTemplateShare(String(route.query.preset));
    if (shared) {
      applyLoaded(shared);
      success(t('tournament.importSuccess'));
    } else {
      showError(t('tournament.invalidFormat'));
    }
  }
  if (!isEditing.value) return;
  unsubTemplates = listenTemplates((list) => {
    const found = list.find((x) => x.id === templateId.value && x.source === source.value)
      || list.find((x) => x.id === templateId.value);
    if (found) applyLoaded(found);
    if (unsubTemplates) { unsubTemplates(); unsubTemplates = null; } // one read is enough
  });
});

onUnmounted(() => {
  if (unsubTemplates) unsubTemplates();
  if (unsubStructures) unsubStructures();
});

// ── save ──────────────────────────────────────────────
async function handleSave() {
  // Re-snapshot a structure that's still in the library (picks up its edits)
  const live = findLibrary(structureChoice.value);
  if (live) form.value.structure = structureSnapshot(live);
  const template = templateFrom(form.value);
  const errors = validateTemplate(template);
  if (isCash.value && !derivedRate.value) errors.unshift('buyInInvalid');
  if (errors.length) {
    showError(t(`template.errors.${errors[0]}`));
    return;
  }
  saving.value = true;
  try {
    await saveTemplate({ ...template, id: templateId.value }, isEditing.value ? source.value : 'template');
    success(t('common.save') + ' ✓');
    router.push({ path: '/templates', query: { kind: template.kind } });
  } catch (e) {
    showError(e.message);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push({ path: '/templates', query: { kind: form.value.kind } });
}

// ── share / import ────────────────────────────────────
function shareUrl() {
  const encoded = encodeTemplateShare(templateFrom(form.value));
  return `${window.location.origin}${window.location.pathname}#/template-setup?preset=${encodeURIComponent(encoded)}`;
}

function shareByLink() {
  navigator.clipboard.writeText(shareUrl())
    .then(() => success(t('common.copySuccess')))
    .catch(() => showError(t('common.copyFailed')));
}

function shareByLine() {
  const tpl = templateFrom(form.value);
  const text = `${isCash.value ? '💵' : '🏆'} ${tpl.name || t('template.title')}`;
  window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(text)}`, '_blank');
}

function exportConfig() {
  const tpl = templateFrom(form.value);
  const { migratedFrom: _m, id: _i, ...data } = tpl;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tpl.name || 'template'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importConfig(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = templateFromImport(JSON.parse(reader.result));
      if (!imported || (isEditing.value && imported.kind !== form.value.kind)) {
        showError(t('tournament.invalidFormat'));
        return;
      }
      const keep = form.value.migratedFrom;
      applyLoaded(imported);
      form.value.migratedFrom = keep;
      success(t('tournament.importSuccess'));
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
  background: rgb(var(--tw-slate-800) / 0.6);
  border: 1px solid rgb(var(--tw-white) / 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
}
.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgb(var(--tw-white) / 0.8);
  letter-spacing: 0.04em;
}
.field-label {
  display: block;
  font-size: 0.8rem;
  color: rgb(var(--tw-white) / 0.6);
  margin-bottom: 0.25rem;
}
.field-input {
  width: 100%;
  background: rgb(var(--tw-slate-900));
  border: 1px solid rgb(var(--tw-slate-600));
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: rgb(var(--tw-white));
  font-size: 0.9rem;
}
.field-input:focus { outline: none; border-color: rgb(var(--tw-amber-500)); }
.hint { font-size: 0.75rem; color: rgb(var(--tw-white) / 0.45); }
.step-btn {
  flex-shrink: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  background: rgb(var(--tw-slate-700));
  font-size: 0.8rem;
  font-weight: 600;
}
.step-btn:hover { background: rgb(var(--tw-slate-600)); }
.bounty-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.6);
  font-size: 0.85rem;
  text-align: left;
}
.bounty-opt.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.12); }
.bounty-opt:disabled { opacity: 0.5; cursor: not-allowed; }
.bounty-opt .soon { font-size: 0.7rem; color: rgb(var(--tw-amber-400)); }
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgb(var(--tw-white));
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
</style>
