<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="handleBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">{{ pageTitle }}</h1>
        <button
          @click="handleSaveClick"
          :disabled="!canEditItem || isStatusLocked(game)"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition"
          :class="canEditItem && !isStatusLocked(game)
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-slate-600 text-gray-400 cursor-not-allowed'"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-5">
      <div v-if="isHistorySyncing" class="rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        <div class="flex items-center gap-2">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ syncStatusMessage }}</span>
        </div>
      </div>

      <div v-if="loading" class="text-center py-12">
        <i class="fas fa-spinner fa-spin text-2xl text-amber-400"></i>
      </div>

      <template v-else-if="game">
        <div v-if="!canEditItem" class="bg-red-900/30 border border-red-700 rounded-2xl p-5 text-center">
          <i class="fas fa-lock text-3xl text-red-400 mb-3 block"></i>
          <p class="text-red-300 font-semibold">{{ $t('admin.permissionDenied') }}</p>
          <p class="text-gray-400 text-sm mt-1">{{ $t('admin.permissionDeniedHint') }}</p>
        </div>

        <template v-else>
          <div v-if="isStatusLocked(game)" class="bg-slate-700/60 border border-slate-600 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-archive text-gray-400 text-xl"></i>
            <div>
              <p class="text-white font-semibold text-sm">{{ $t('admin.statusLocked') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusLockedHint') }}</p>
            </div>
          </div>

          <div v-else-if="isStatusWarning(game)" class="bg-amber-600/20 border border-amber-600/50 rounded-2xl p-4 flex items-center gap-3">
            <i class="fas fa-exclamation-triangle text-amber-400 text-xl"></i>
            <div>
              <p class="text-amber-300 font-semibold text-sm">{{ $t('admin.statusActiveWarning') }}</p>
              <p class="text-gray-400 text-xs mt-0.5">{{ $t('admin.statusActiveHint') }}</p>
            </div>
          </div>

          <section class="card">
            <h2 class="section-title">{{ $t('tournament.basicInfo') }}</h2>
            <div class="space-y-3">
              <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
                  <input
                    v-model.number="form.blinds.small"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
                  <input
                    v-model.number="form.blinds.big"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <div v-if="isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.minBuyIn') }}</label>
                  <input
                    v-model.number="form.minBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.maxBuyIn') }}</label>
                  <input
                    v-model.number="form.maxBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <div v-if="isPokerGame">
                <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
                <input
                  v-model.number="form.maxPlayers"
                  type="number"
                  min="2"
                  max="20"
                  class="field-input"
                  disabled
                />
              </div>

              <div v-if="!isPokerGame">
                <label class="field-label">{{ $t('game.title') }}</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="field-input"
                  :placeholder="$t('game.title')"
                  :disabled="isStatusLocked(game)"
                />
              </div>

              <div v-if="!isPokerGame" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('admin.cashEdit.baseBuyIn') }}</label>
                  <input
                    v-model.number="form.baseBuyIn"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div v-if="game.type === 'online'">
                  <label class="field-label">{{ $t('lobby.maxPlayers') }}</label>
                  <input
                    v-model.number="form.maxPlayers"
                    type="number"
                    min="2"
                    max="20"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <div v-if="!isPokerGame && game.type === 'online'" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="field-label">{{ $t('tournament.smallBlind') }}</label>
                  <input
                    v-model.number="form.blinds.small"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
                <div>
                  <label class="field-label">{{ $t('tournament.bigBlind') }}</label>
                  <input
                    v-model.number="form.blinds.big"
                    type="number"
                    min="0"
                    class="field-input"
                    :disabled="isStatusLocked(game)"
                  />
                </div>
              </div>

              <div>
                <label class="field-label">{{ $t('admin.cashEdit.notes') }}</label>
                <textarea
                  v-model="form.notes"
                  rows="2"
                  class="field-input"
                  :placeholder="$t('admin.cashEdit.notesPlaceholder')"
                  :disabled="isStatusLocked(game)"
                ></textarea>
              </div>
            </div>
          </section>

          <section v-if="showSettlementEditor" class="card">
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
                  @click="showHandRecord = true"
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
                    {{ Object.keys(v.after || {}).join(', ') }}
                  </span>
                  <button
                    v-if="isAdmin && !isStatusLocked(game)"
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
        {{ $t('game.gameNotFound') }}
      </div>
    </div>

    <ConfigDiffPreview
      v-if="showDiff"
      :changes="diffChanges"
      :status-warning="isStatusWarning(game)"
      @confirm="handleConfirmSave"
      @cancel="showDiff = false"
    />

    <HandRecordSheet
      v-model="showHandRecord"
      :game-id="gameId"
      :players="game?.players || []"
      :base-buy-in="game?.baseBuyIn || 0"
      @saved="handleHandRecordSaved"
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
import { useUserStore } from '../../store/modules/user.js';
import { formatNumber } from '../../utils/formatters.js';
import ConfigDiffPreview from '../../components/admin/ConfigDiffPreview.vue';
import HandRecordSheet from '../../components/game/HandRecordSheet.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, warning, error: showError } = useNotification();
const userStore = useUserStore();
const { isAdmin, permissionsLoaded, loadPermissions, canEdit, isStatusLocked, isStatusWarning } = useTablePermissions();
const {
  saveGameConfig,
  saveSettlementCorrection,
  saveTournamentSettlementCorrection,
  syncCompletedGameHistory,
  isSyncing: isCallableSyncing,
  getConfigVersions,
  rollbackToVersion,
} = useConfigEditor();

const gameId = computed(() => route.params.gameId);
const sourceCollection = computed(() => route.query.src || 'pokerGames');

const game = ref(null);
const loading = ref(true);
const form = ref({
  name: '',
  baseBuyIn: 0,
  minBuyIn: 0,
  maxBuyIn: 0,
  maxPlayers: 10,
  blinds: { small: 1, big: 2 },
  notes: '',
});
const versions = ref([]);
const versionsLoaded = ref(false);
const loadingVersions = ref(false);
const showDiff = ref(false);
const diffChanges = ref([]);
const showHandRecord = ref(false);
const correctionReason = ref('');
const correctionForm = ref({
  rate: 1,
  players: [],
});
const isHistorySyncing = ref(false);
const syncStatusMessage = ref('');

const canEditItem = computed(() => game.value && canEdit(game.value));
const activeCollection = ref('pokerGames');
const isPokerGame = computed(() => activeCollection.value === 'pokerGames');
const isTournamentGame = computed(() => !isPokerGame.value && game.value?.type === 'tournament');
const isCashGame = computed(() => !isPokerGame.value && game.value?.type !== 'tournament');
const showCashSettlementEditor = computed(() => isCashGame.value && game.value?.status === 'completed');
const showTournamentSettlementEditor = computed(() => isTournamentGame.value && game.value?.status === 'completed');
const showSettlementEditor = computed(() => showCashSettlementEditor.value || showTournamentSettlementEditor.value);
const effectiveBaseBuyIn = computed(() => Number(game.value?.baseBuyIn) || 0);
const pageTitle = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.resultTitle')
  : t('admin.cashEdit.title'));
const settlementEditorTitle = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.settlementCorrectionTitle')
  : t('admin.cashEdit.settlementCorrectionTitle'));
const settlementEditorHint = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.settlementCorrectionHint')
  : t('admin.cashEdit.settlementCorrectionHint'));
const settlementActionLabel = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.syncSettlement')
  : t('admin.cashEdit.syncSettlement'));
const settlementSuccessMessage = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.syncSettlementSuccess')
  : t('admin.cashEdit.syncSettlementSuccess'));
const balanceStatusLabel = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.balanceStatus')
  : t('admin.cashEdit.balanceStatus'));
const primaryResultLabel = computed(() => showTournamentSettlementEditor.value
  ? t('tournament.prize')
  : t('admin.cashEdit.profitChips'));
const secondaryResultLabel = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.netProfit')
  : t('admin.cashEdit.profitCash'));

const RISKY_FIELDS = new Set(['meta.blinds.small', 'meta.blinds.big', 'meta.minBuyIn', 'meta.maxBuyIn']);

const FIELD_LABELS = computed(() => ({
  'meta.minBuyIn': t('admin.cashEdit.minBuyIn'),
  'meta.maxBuyIn': t('admin.cashEdit.maxBuyIn'),
  'meta.blinds.small': t('tournament.smallBlind'),
  'meta.blinds.big': t('tournament.bigBlind'),
  'meta.notes': t('admin.cashEdit.notes'),
}));

const correctionTotals = computed(() => {
  const totalBuyIn = correctionForm.value.players.reduce((sum, player) => sum + getPlayerBuyIn(player), 0);
  const totalStack = correctionForm.value.players.reduce((sum, player) => sum + roundChipAmount(player.stack), 0);
  const totalPrize = correctionForm.value.players.reduce((sum, player) => sum + getPlayerPrize(player), 0);

  return {
    totalBuyIn,
    totalStack,
    totalPrize,
    isBalanced: showTournamentSettlementEditor.value
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

  if (showCashSettlementEditor.value && (!Number.isFinite(Number(correctionForm.value.rate)) || Number(correctionForm.value.rate) <= 0)) {
    messages.push(t('admin.validation.exchangeRatePositive'));
  }

  if (correctionForm.value.players.some((player) => !player.name?.trim())) {
    messages.push(t('admin.validation.playerNameRequired'));
  }

  if (
    correctionForm.value.players.some(
      (player) => Number(player.buyInUnits) < 0 || (showCashSettlementEditor.value
        ? roundChipAmount(player.stack) < 0
        : getPlayerPrize(player) < 0)
    )
  ) {
    messages.push(showTournamentSettlementEditor.value
      ? t('admin.validation.negativeTournamentCorrectionValues')
      : t('admin.validation.negativeCorrectionValues'));
  }

  if (showCashSettlementEditor.value && !correctionTotals.value.isBalanced) {
    messages.push(t('admin.validation.chipsNotBalanced'));
  }

  if (showTournamentSettlementEditor.value && correctionTotals.value.totalBuyIn !== correctionTotals.value.totalPrize) {
    messages.push(t('admin.validation.prizeNotBalanced'));
  }

  return [...new Set(messages)];
});

const canSaveCorrection = computed(() => {
  return canEditItem.value && showSettlementEditor.value && correctionErrors.value.length === 0 && !isHistorySyncing.value;
});

async function waitForProjectionSync(syncToken) {
  isHistorySyncing.value = true;
  syncStatusMessage.value = t('loading.syncingHistory');

  const result = await userStore.waitForHistorySync(gameId.value, syncToken, {
    timeoutMs: 20000,
    fallbackToGameProjection: true,
  });

  isHistorySyncing.value = false;

  if (result.source === 'timeout') {
    warning(t('loading.syncingPending'));
  }

  return result;
}

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
  const profit = showTournamentSettlementEditor.value ? getTournamentProfit(player) : getPlayerProfit(player);
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
  const rate = Number(correctionForm.value.rate) || 1;
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

function getTournamentSettlementRowKey(entry, index) {
  if (entry?.playerId || entry?.id) {
    return `player:${entry.playerId || entry.id}`;
  }

  if (entry?.odId || entry?.uid) {
    return `uid:${entry.odId || entry.uid}`;
  }

  if (entry?.placement != null) {
    return `placement:${entry.placement}`;
  }

  return `fallback:${entry?.name || ''}:${index}`;
}

function hydrateCorrectionForm(players = [], rate = 1) {
  const baseBuyIn = Number(game.value?.baseBuyIn) || 0;

  correctionForm.value = {
    rate: Number(rate) > 0 ? Number(rate) : 1,
    players: players.map((player) => ({
      uid: player.uid || null,
      name: player.name || '',
      buyInUnits: baseBuyIn > 0 ? Number(((player.buyIn || 0) / baseBuyIn).toFixed(2)) : 0,
      stack: player.stack || 0,
    })),
  };
}

function hydrateTournamentCorrectionForm(players = [], settlementRows = []) {
  const baseBuyIn = Number(game.value?.baseBuyIn) || 0;
  const rowMap = new Map(
    settlementRows.map((row, index) => [getTournamentSettlementRowKey(row, index), row])
  );

  correctionForm.value = {
    rate: 1,
    players: players.map((player, index) => {
      const row = rowMap.get(getTournamentSettlementRowKey(player, index)) || {};
      return {
        id: player.id || null,
        uid: player.uid || null,
        name: player.name || '',
        buyInUnits: baseBuyIn > 0 ? Number(((player.buyIn || 0) / baseBuyIn).toFixed(2)) : 0,
        placement: row.placement ?? player.placement ?? null,
        prize: row.prize || 0,
      };
    }),
  };
}

function buildCorrectedPlayers() {
  return correctionForm.value.players.map((player, index) => ({
    ...(game.value?.players?.[index] || {}),
    name: player.name.trim(),
    buyIn: getPlayerBuyIn(player),
    stack: roundChipAmount(player.stack),
  }));
}

function buildCorrectedTournamentPlayers() {
  return correctionForm.value.players.map((player, index) => ({
    ...(game.value?.players?.[index] || {}),
    name: player.name.trim(),
    buyIn: getPlayerBuyIn(player),
    placement: player.placement ?? game.value?.players?.[index]?.placement ?? null,
    prize: getPlayerPrize(player),
  }));
}

function buildSettlementBefore() {
  return {
    rate: game.value?.rate,
    players: game.value?.players ? game.value.players.map((player) => ({ ...player })) : [],
    settlementSnapshot: Array.isArray(game.value?.settlementSnapshot)
      ? game.value.settlementSnapshot.map((row) => ({ ...row }))
      : [],
  };
}

async function resolveSettlementRate(gameData) {
  if (Number(gameData?.rate) > 0) return Number(gameData.rate);

  const linkedPlayer = gameData?.players?.find((player) => player.uid);
  if (!linkedPlayer?.uid) return 1;

  try {
    const userSnap = await getDoc(doc(db, 'users', linkedPlayer.uid));
    if (!userSnap.exists()) return 1;

    const matchingRecord = (userSnap.data().history || []).find((record) => record.gameId === gameId.value);
    return Number(matchingRecord?.rate) > 0 ? Number(matchingRecord.rate) : 1;
  } catch (error) {
    console.warn('resolveSettlementRate failed:', error);
    return 1;
  }
}

function buildDiffChanges(before, after) {
  const changes = [];

  const compare = (key, bVal, aVal, label, isRisky) => {
    if (JSON.stringify(bVal ?? null) !== JSON.stringify(aVal ?? null)) {
      changes.push({ field: key, label, before: bVal, after: aVal, isRisky: isRisky || false });
    }
  };

  if (isPokerGame.value) {
    for (const key of Object.keys(FIELD_LABELS.value)) {
      compare(key, before[key], after[key], FIELD_LABELS.value[key], RISKY_FIELDS.has(key));
    }
  } else {
    compare('name', before.name, after.name, t('game.title'), false);
    compare('baseBuyIn', before.baseBuyIn, after.baseBuyIn, t('admin.cashEdit.baseBuyIn'), true);
    compare('maxPlayers', before.maxPlayers, after.maxPlayers, t('lobby.maxPlayers'), false);
    compare('blinds.small', before.blinds?.small, after.blinds?.small, t('tournament.smallBlind'), true);
    compare('blinds.big', before.blinds?.big, after.blinds?.big, t('tournament.bigBlind'), true);
    compare('notes', before.notes, after.notes, t('admin.cashEdit.notes'), false);
  }

  return changes;
}

function formToFirestoreUpdates() {
  if (isPokerGame.value) {
    return {
      'meta.minBuyIn': form.value.minBuyIn,
      'meta.maxBuyIn': form.value.maxBuyIn,
      'meta.blinds.small': form.value.blinds.small,
      'meta.blinds.big': form.value.blinds.big,
      'meta.notes': form.value.notes || '',
    };
  }

  const updates = {
    name: form.value.name,
    baseBuyIn: form.value.baseBuyIn,
    notes: form.value.notes || '',
  };

  if (game.value?.type === 'online') {
    updates.maxPlayers = form.value.maxPlayers;
    updates.blinds = { small: form.value.blinds.small, big: form.value.blinds.big };
  }

  return updates;
}

function formToBefore() {
  if (isPokerGame.value) {
    return {
      'meta.minBuyIn': game.value?.meta?.minBuyIn,
      'meta.maxBuyIn': game.value?.meta?.maxBuyIn,
      'meta.blinds.small': game.value?.meta?.blinds?.small,
      'meta.blinds.big': game.value?.meta?.blinds?.big,
      'meta.notes': game.value?.meta?.notes || '',
    };
  }

  return {
    name: game.value?.name,
    baseBuyIn: game.value?.baseBuyIn,
    notes: game.value?.notes || '',
    maxPlayers: game.value?.maxPlayers,
    blinds: game.value?.blinds ? { ...game.value.blinds } : undefined,
  };
}

function formToAfter() {
  if (isPokerGame.value) {
    return {
      'meta.minBuyIn': form.value.minBuyIn,
      'meta.maxBuyIn': form.value.maxBuyIn,
      'meta.blinds.small': form.value.blinds.small,
      'meta.blinds.big': form.value.blinds.big,
      'meta.notes': form.value.notes || '',
    };
  }

  return {
    name: form.value.name,
    baseBuyIn: form.value.baseBuyIn,
    notes: form.value.notes || '',
    maxPlayers: form.value.maxPlayers,
    blinds: { small: form.value.blinds.small, big: form.value.blinds.big },
  };
}

function validate() {
  if (isPokerGame.value) {
    if (form.value.blinds.small < 0 || form.value.blinds.big < 0) {
      showError(t('admin.validation.blindsNegative'));
      return false;
    }
    if (form.value.blinds.big < form.value.blinds.small) {
      showError(t('admin.validation.bigBlindLessThanSmall'));
      return false;
    }
    if (form.value.minBuyIn < 0 || form.value.maxBuyIn < 0) {
      showError(t('admin.validation.buyInNegative'));
      return false;
    }
    if (form.value.minBuyIn > form.value.maxBuyIn) {
      showError(t('admin.validation.minBuyInExceedsMax'));
      return false;
    }
  } else {
    if (!form.value.name?.trim()) {
      showError(t('tournament.nameRequired'));
      return false;
    }
    if (form.value.baseBuyIn < 0) {
      showError(t('admin.validation.buyInNegative'));
      return false;
    }
    if (game.value?.type === 'online') {
      if (form.value.blinds.small < 0 || form.value.blinds.big < 0) {
        showError(t('admin.validation.blindsNegative'));
        return false;
      }
      if (form.value.blinds.big < form.value.blinds.small) {
        showError(t('admin.validation.bigBlindLessThanSmall'));
        return false;
      }
    }
  }

  return true;
}

async function handleSaveClick() {
  if (!validate()) return;
  diffChanges.value = buildDiffChanges(formToBefore(), formToAfter());
  showDiff.value = true;
}

async function handleConfirmSave(reason) {
  showDiff.value = false;
  const before = formToBefore();
  const firestoreUpdates = formToFirestoreUpdates();
  const after = formToAfter();

  try {
    await saveGameConfig(activeCollection.value, gameId.value, firestoreUpdates, before, reason);
    if (isPokerGame.value) {
      if (!game.value.meta) game.value.meta = {};
      if (!game.value.meta.blinds) game.value.meta.blinds = {};
      game.value.meta.minBuyIn = form.value.minBuyIn;
      game.value.meta.maxBuyIn = form.value.maxBuyIn;
      game.value.meta.blinds.small = form.value.blinds.small;
      game.value.meta.blinds.big = form.value.blinds.big;
      game.value.meta.notes = form.value.notes;
    } else {
      Object.assign(game.value, after);
    }
    success(t('common.save') + ' ✓');
    versionsLoaded.value = false;
    versions.value = [];
  } catch (e) {
    showError(e.message);
  }
}

async function handleSettlementCorrection() {
  if (!canSaveCorrection.value) return;

  try {
    const before = buildSettlementBefore();
    const payload = showTournamentSettlementEditor.value
      ? { players: buildCorrectedTournamentPlayers() }
      : {
        rate: Number(correctionForm.value.rate),
        players: buildCorrectedPlayers(),
      };

    const result = showTournamentSettlementEditor.value
      ? await saveTournamentSettlementCorrection(gameId.value, payload, before, correctionReason.value)
      : await saveSettlementCorrection(gameId.value, payload, before, correctionReason.value);
    game.value = {
      ...game.value,
      players: result.players,
      rate: result.rate ?? game.value.rate,
      settlementSnapshot: result.settlementSnapshot || game.value.settlementSnapshot,
    };
    correctionReason.value = '';
    if (showTournamentSettlementEditor.value) {
      hydrateTournamentCorrectionForm(result.players, result.settlementSnapshot || []);
    } else {
      hydrateCorrectionForm(result.players, result.rate);
    }
    versionsLoaded.value = false;
    versions.value = [];
    await userStore.loadUserData();
    await waitForProjectionSync(result.syncToken);
    success(settlementSuccessMessage.value);
  } catch (e) {
    showError(e.message);
  }
}

async function handleManualSync() {
  try {
    const result = await syncCompletedGameHistory(gameId.value);
    await waitForProjectionSync(result.syncToken);
    success(t('admin.cashEdit.manualSyncSuccess'));
  } catch (e) {
    showError(e.message);
  }
}

async function handleRollback(version) {
  try {
    await rollbackToVersion(
      activeCollection.value,
      gameId.value,
      version.id,
      `Rollback to ${formatTimestamp(version.timestamp)}`
    );
    success(t('admin.versionHistory.rollbackSuccess'));
    await loadGame();
    await loadVersions();
  } catch (e) {
    showError(e.message);
  }
}

async function loadGame() {
  loading.value = true;
  try {
    let snap = await getDoc(doc(db, sourceCollection.value, gameId.value));
    let usedCollection = sourceCollection.value;

    if (!snap.exists()) {
      const fallback = sourceCollection.value === 'pokerGames' ? 'games' : 'pokerGames';
      snap = await getDoc(doc(db, fallback, gameId.value));
      if (snap.exists()) {
        usedCollection = fallback;
      }
    }

    activeCollection.value = usedCollection;

    if (snap.exists()) {
      game.value = { id: snap.id, ...snap.data() };

      if (isPokerGame.value) {
        form.value = {
          name: game.value.meta?.name || '',
          baseBuyIn: 0,
          minBuyIn: game.value.meta?.minBuyIn ?? 0,
          maxBuyIn: game.value.meta?.maxBuyIn ?? 0,
          maxPlayers: game.value.meta?.maxPlayers ?? 10,
          blinds: {
            small: game.value.meta?.blinds?.small ?? 1,
            big: game.value.meta?.blinds?.big ?? 2,
          },
          notes: game.value.meta?.notes || '',
        };
      } else {
        form.value = {
          name: game.value.name || '',
          baseBuyIn: game.value.baseBuyIn || 0,
          minBuyIn: 0,
          maxBuyIn: 0,
          maxPlayers: game.value.maxPlayers || 10,
          blinds: {
            small: game.value.blinds?.small || 1,
            big: game.value.blinds?.big || 2,
          },
          notes: game.value.notes || '',
        };

        if (game.value.status === 'completed' && isCashGame.value) {
          const rate = await resolveSettlementRate(game.value);
          hydrateCorrectionForm(game.value.players || [], rate);
        } else if (game.value.status === 'completed' && isTournamentGame.value) {
          hydrateTournamentCorrectionForm(game.value.players || [], game.value.settlementSnapshot || []);
        } else {
          hydrateCorrectionForm([], 1);
        }
      }
    } else {
      hydrateCorrectionForm([], 1);
    }
  } finally {
    loading.value = false;
  }
}

function handleHandRecordSaved() {
  success(t('hand.recordHand') + ' ✓');
}

async function loadVersions() {
  loadingVersions.value = true;
  try {
    versions.value = await getConfigVersions(activeCollection.value, gameId.value);
    versionsLoaded.value = true;
  } catch (e) {
    console.error('load versions error', e);
  } finally {
    loadingVersions.value = false;
  }
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
  await loadGame();
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
