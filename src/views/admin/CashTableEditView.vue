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

          <CashTableBasicInfoForm
            :is-poker-game="isPokerGame"
            :game-type="game.type || ''"
            :locked="isStatusLocked(game)"
            v-model:name="form.name"
            v-model:base-buy-in="form.baseBuyIn"
            v-model:min-buy-in="form.minBuyIn"
            v-model:max-buy-in="form.maxBuyIn"
            v-model:max-players="form.maxPlayers"
            v-model:small-blind="form.blinds.small"
            v-model:big-blind="form.blinds.big"
            v-model:notes="form.notes"
          />

          <SettlementCorrectionEditor
            v-if="showSettlementEditor"
            :game="game"
            :correction-form="correctionForm"
            v-model:reason="correctionReason"
            :show-cash-settlement-editor="showCashSettlementEditor"
            :show-tournament-settlement-editor="showTournamentSettlementEditor"
            :can-edit="canEditItem"
            :is-history-syncing="isHistorySyncing"
            :is-callable-syncing="isCallableSyncing"
            @manual-sync="handleManualSync"
            @record-hand="showHandRecord = true"
            @save="handleSettlementCorrection"
          />

          <VersionHistoryPanel
            :versions="versions"
            :loading="loadingVersions"
            :loaded="versionsLoaded"
            :can-rollback="isAdmin && !isStatusLocked(game)"
            @load="loadVersions"
            @rollback="handleRollback"
          />
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
import CashTableBasicInfoForm from '../../components/admin/CashTableBasicInfoForm.vue';
import SettlementCorrectionEditor from '../../components/admin/SettlementCorrectionEditor.vue';
import VersionHistoryPanel from '../../components/admin/VersionHistoryPanel.vue';
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
const pageTitle = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.resultTitle')
  : t('admin.cashEdit.title'));
const settlementSuccessMessage = computed(() => showTournamentSettlementEditor.value
  ? t('admin.tournamentEdit.syncSettlementSuccess')
  : t('admin.cashEdit.syncSettlementSuccess'));

const RISKY_FIELDS = new Set(['meta.blinds.small', 'meta.blinds.big', 'meta.minBuyIn', 'meta.maxBuyIn']);

const FIELD_LABELS = computed(() => ({
  'meta.minBuyIn': t('admin.cashEdit.minBuyIn'),
  'meta.maxBuyIn': t('admin.cashEdit.maxBuyIn'),
  'meta.blinds.small': t('tournament.smallBlind'),
  'meta.blinds.big': t('tournament.bigBlind'),
  'meta.notes': t('admin.cashEdit.notes'),
}));

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

async function handleSettlementCorrection(payload) {
  try {
    const before = buildSettlementBefore();

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
