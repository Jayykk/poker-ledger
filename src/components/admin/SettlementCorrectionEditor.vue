<template>
  <section class="card">
    <!-- Sync error banner -->
    <div
      v-if="game?.historyProjection?.lastError"
      class="mb-4 px-4 py-3 rounded-xl bg-rose-900/40 border border-rose-600/50 flex items-start gap-3"
    >
      <i class="fas fa-triangle-exclamation text-rose-400 mt-0.5 shrink-0"></i>
      <div class="flex-1 min-w-0">
        <div class="text-rose-300 font-semibold text-sm">{{ $t('admin.cashEdit.syncError') }}</div>
        <div class="text-rose-400/80 text-xs mt-0.5 break-all">{{ game.historyProjection.lastError }}</div>
        <div class="text-gray-400 text-xs mt-1">{{ $t('admin.cashEdit.syncErrorHint') }}</div>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="section-title mb-0">{{ settlementEditorTitle }}</h2>
        <p class="text-xs text-gray-400 mt-1">{{ settlementEditorHint }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          @click="handleManualSync"
          :disabled="isHistorySyncing || isCallableSyncing"
          class="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-600 bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i class="fas fa-rotate mr-2 text-sky-400"></i>{{ $t('admin.cashEdit.manualSync') }}
        </button>

        <button
          @click="$emit('record-hand')"
          class="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-600 bg-slate-800 hover:bg-slate-700 transition"
        >
          <i class="fas fa-clone mr-2 text-amber-400"></i>{{ $t('hand.recordHand') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      <div v-if="showCashSettlementEditor">
        <label class="field-label">{{ $t('admin.cashEdit.exchangeRate') }}</label>
        <input
          v-model.number="correctionForm.rate"
          type="number"
          min="1"
          class="field-input"
        />
        <p class="field-hint">{{ $t('admin.cashEdit.exchangeRateHint') }}</p>
      </div>

      <div>
        <label class="field-label">{{ $t('admin.cashEdit.baseBuyIn') }}</label>
        <div class="field-static">{{ formatNumber(effectiveBaseBuyIn) }}</div>
        <p class="field-hint">{{ $t('admin.cashEdit.baseBuyInHint') }}</p>
      </div>
    </div>

    <div class="mt-3">
      <label class="field-label">{{ $t('admin.cashEdit.correctionReason') }}</label>
      <textarea
        v-model="correctionReason"
        rows="2"
        class="field-input"
        :placeholder="$t('admin.cashEdit.correctionReasonPlaceholder')"
      ></textarea>
    </div>

    <div class="space-y-3 mt-4">
      <div
        v-for="(player, index) in correctionForm.players"
        :key="player.uid || `${player.name}-${index}`"
        class="rounded-xl border border-slate-700 bg-slate-900/50 p-4"
      >
        <div class="text-xs text-gray-500 mb-3">#{{ index + 1 }}</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="field-label">{{ $t('game.playerName') }}</label>
            <input v-if="isNameEditable(player)" v-model="player.name" type="text" class="field-input" />
            <div v-else class="field-static">{{ player.name }}</div>
            <p v-if="!isNameEditable(player)" class="field-hint">{{ $t('admin.linkedPlayerNameHint') }}</p>
          </div>

          <div>
            <label class="field-label">{{ $t('admin.cashEdit.buyInUnits') }}</label>
            <input
              v-model.number="player.buyInUnits"
              type="number"
              min="0"
              step="0.5"
              class="field-input"
            />
            <p class="field-hint">
              {{ formatNumber(getPlayerBuyIn(player)) }} {{ $t('admin.cashEdit.chipsUnit') }}
            </p>
          </div>

          <div v-if="showCashSettlementEditor">
            <label class="field-label">{{ $t('game.stack') }}</label>
            <input
              v-model.number="player.stack"
              type="number"
              min="0"
              class="field-input"
            />
          </div>

          <div v-else>
            <label class="field-label">{{ $t('tournament.placement') }}</label>
            <div class="field-static">{{ formatPlacement(player.placement) }}</div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label">{{ primaryResultLabel }}</label>
              <input
                v-if="showTournamentSettlementEditor"
                v-model.number="player.prize"
                type="number"
                min="0"
                class="field-input"
              />
              <div class="field-static" :class="getProfitDisplayClass(player)">
                <template v-if="showCashSettlementEditor">
                  {{ formatSignedNumber(getPlayerProfit(player)) }}
                </template>
                <template v-else>
                  {{ formatSignedNumber(getPlayerPrize(player)) }}
                </template>
              </div>
            </div>

            <div>
              <label class="field-label">{{ secondaryResultLabel }}</label>
              <div class="field-static" :class="getProfitDisplayClass(player)">
                <template v-if="showCashSettlementEditor">
                  {{ formatSignedNumber(getPlayerProfitCash(player)) }}
                </template>
                <template v-else>
                  {{ formatSignedNumber(getTournamentProfit(player)) }}
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="correctionErrors.length > 0" class="space-y-1 mt-4">
      <p
        v-for="message in correctionErrors"
        :key="message"
        class="text-xs text-rose-400"
      >
        {{ message }}
      </p>
    </div>

    <div class="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-sm font-semibold" :class="correctionTotals.isBalanced ? 'text-emerald-400' : 'text-rose-400'">
          {{ balanceStatusLabel }}: {{ correctionTotals.isBalanced ? 'OK' : 'NG' }}
        </p>
        <p class="text-xs text-gray-400 mt-1">
          <template v-if="showCashSettlementEditor">
            {{ formatNumber(correctionTotals.totalBuyIn) }} / {{ formatNumber(correctionTotals.totalStack) }} {{ $t('admin.cashEdit.chipsUnit') }}
          </template>
          <template v-else>
            {{ formatNumber(correctionTotals.totalBuyIn) }} / {{ formatNumber(correctionTotals.totalPrize) }}
          </template>
        </p>
      </div>

      <button
        @click="handleSettlementCorrection"
        :disabled="!canSaveCorrection"
        class="px-4 py-2 rounded-lg text-sm font-semibold transition"
        :class="canSaveCorrection
          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
          : 'bg-slate-600 text-gray-400 cursor-not-allowed'"
      >
        {{ settlementActionLabel }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from '../../utils/formatters.js';

const props = defineProps({
  /** Loaded game document (read-only; used for baseBuyIn, players and sync error display) */
  game: {
    type: Object,
    default: null,
  },
  /** Correction form state owned by the parent ({ rate, players }) */
  correctionForm: {
    type: Object,
    required: true,
  },
  /** Correction reason text (v-model:reason) */
  reason: {
    type: String,
    default: '',
  },
  showCashSettlementEditor: {
    type: Boolean,
    default: false,
  },
  showTournamentSettlementEditor: {
    type: Boolean,
    default: false,
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
  isHistorySyncing: {
    type: Boolean,
    default: false,
  },
  isCallableSyncing: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['manual-sync', 'record-hand', 'save', 'update:reason']);

const { t } = useI18n();

const correctionReason = computed({
  get: () => props.reason,
  set: (value) => emit('update:reason', value),
});

const showSettlementEditor = computed(() => props.showCashSettlementEditor || props.showTournamentSettlementEditor);
const effectiveBaseBuyIn = computed(() => Number(props.game?.baseBuyIn) || 0);
const settlementEditorTitle = computed(() => props.showTournamentSettlementEditor
  ? t('admin.tournamentEdit.settlementCorrectionTitle')
  : t('admin.cashEdit.settlementCorrectionTitle'));
const settlementEditorHint = computed(() => props.showTournamentSettlementEditor
  ? t('admin.tournamentEdit.settlementCorrectionHint')
  : t('admin.cashEdit.settlementCorrectionHint'));
const settlementActionLabel = computed(() => props.showTournamentSettlementEditor
  ? t('admin.tournamentEdit.syncSettlement')
  : t('admin.cashEdit.syncSettlement'));
const balanceStatusLabel = computed(() => props.showTournamentSettlementEditor
  ? t('admin.tournamentEdit.balanceStatus')
  : t('admin.cashEdit.balanceStatus'));
const primaryResultLabel = computed(() => props.showTournamentSettlementEditor
  ? t('tournament.prize')
  : t('admin.cashEdit.profitChips'));
const secondaryResultLabel = computed(() => props.showTournamentSettlementEditor
  ? t('admin.tournamentEdit.netProfit')
  : t('admin.cashEdit.profitCash'));

const correctionTotals = computed(() => {
  const totalBuyIn = props.correctionForm.players.reduce((sum, player) => sum + getPlayerBuyIn(player), 0);
  const totalStack = props.correctionForm.players.reduce((sum, player) => sum + roundChipAmount(player.stack), 0);
  const totalPrize = props.correctionForm.players.reduce((sum, player) => sum + getPlayerPrize(player), 0);

  return {
    totalBuyIn,
    totalStack,
    totalPrize,
    isBalanced: props.showTournamentSettlementEditor
      ? totalBuyIn === totalPrize
      : totalBuyIn === totalStack,
  };
});

const correctionErrors = computed(() => {
  const messages = [];

  if (!showSettlementEditor.value) return messages;

  if (effectiveBaseBuyIn.value <= 0) {
    messages.push(t('admin.validation.baseBuyInPositive'));
  }

  if (props.showCashSettlementEditor && (!Number.isFinite(Number(props.correctionForm.rate)) || Number(props.correctionForm.rate) <= 0)) {
    messages.push(t('admin.validation.exchangeRatePositive'));
  }

  if (props.correctionForm.players.some((player) => !player.name?.trim())) {
    messages.push(t('admin.validation.playerNameRequired'));
  }

  if (
    props.correctionForm.players.some(
      (player) => Number(player.buyInUnits) < 0 || (props.showCashSettlementEditor
        ? roundChipAmount(player.stack) < 0
        : getPlayerPrize(player) < 0)
    )
  ) {
    messages.push(props.showTournamentSettlementEditor
      ? t('admin.validation.negativeTournamentCorrectionValues')
      : t('admin.validation.negativeCorrectionValues'));
  }

  if (props.showCashSettlementEditor && !correctionTotals.value.isBalanced) {
    messages.push(t('admin.validation.chipsNotBalanced'));
  }

  if (props.showTournamentSettlementEditor && correctionTotals.value.totalBuyIn !== correctionTotals.value.totalPrize) {
    messages.push(t('admin.validation.prizeNotBalanced'));
  }

  return [...new Set(messages)];
});

const canSaveCorrection = computed(() => {
  return props.canEdit && showSettlementEditor.value && correctionErrors.value.length === 0 && !props.isHistorySyncing;
});

function roundChipAmount(value) {
  return Math.round(Number(value) || 0);
}

function formatSignedNumber(value) {
  const normalized = Math.round(Number(value) || 0);
  if (normalized > 0) return `+${formatNumber(normalized)}`;
  if (normalized < 0) return `-${formatNumber(Math.abs(normalized))}`;
  return '0';
}

function getProfitDisplayClass(player) {
  const profit = props.showTournamentSettlementEditor ? getTournamentProfit(player) : getPlayerProfit(player);
  if (profit > 0) return 'text-emerald-400';
  if (profit < 0) return 'text-rose-400';
  return 'text-gray-200';
}

function isNameEditable(player) {
  return !player.uid;
}

function getPlayerBuyIn(player) {
  return Math.round((Number(player.buyInUnits) || 0) * effectiveBaseBuyIn.value);
}

function getPlayerProfit(player) {
  return roundChipAmount(player.stack) - getPlayerBuyIn(player);
}

function getPlayerProfitCash(player) {
  const rate = Number(props.correctionForm.rate) || 1;
  return Math.round(getPlayerProfit(player) / rate);
}

function getPlayerPrize(player) {
  return Math.round(Number(player.prize) || 0);
}

function getTournamentProfit(player) {
  return getPlayerPrize(player) - getPlayerBuyIn(player);
}

function formatPlacement(value) {
  return value ? `#${value}` : '-';
}

function buildCorrectedPlayers() {
  return props.correctionForm.players.map((player, index) => ({
    ...(props.game?.players?.[index] || {}),
    name: player.name.trim(),
    buyIn: getPlayerBuyIn(player),
    stack: roundChipAmount(player.stack),
  }));
}

function buildCorrectedTournamentPlayers() {
  return props.correctionForm.players.map((player, index) => ({
    ...(props.game?.players?.[index] || {}),
    name: player.name.trim(),
    buyIn: getPlayerBuyIn(player),
    placement: player.placement ?? props.game?.players?.[index]?.placement ?? null,
    prize: getPlayerPrize(player),
  }));
}

function handleManualSync() {
  emit('manual-sync');
}

function handleSettlementCorrection() {
  if (!canSaveCorrection.value) return;

  const payload = props.showTournamentSettlementEditor
    ? { players: buildCorrectedTournamentPlayers() }
    : {
      rate: Number(props.correctionForm.rate),
      players: buildCorrectedPlayers(),
    };

  emit('save', payload);
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
.field-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.field-static {
  width: 100%;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid #475569;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.9rem;
  min-height: 42px;
  display: flex;
  align-items: center;
}
.field-hint {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.85);
  margin-top: 0.35rem;
}
</style>
