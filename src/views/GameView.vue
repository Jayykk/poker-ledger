<template>
  <div v-if="autoJoinLoading" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
    <LoadingSpinner :text="$t('loading.joining')" />
  </div>

  <div v-else-if="!game" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
    <p>{{ $t('game.noActiveGame') }}</p>
    <BaseButton @click="$router.push('/lobby')" variant="primary">
      {{ $t('nav.lobby') }}
    </BaseButton>
  </div>
  
  <div v-else class="pt-16 px-4 pb-24">
    <!-- Fixed header -->
    <div class="fixed top-0 inset-x-0 z-30 bg-slate-800/90 backdrop-blur px-4 py-3 border-b border-slate-700 flex justify-between items-center max-w-md mx-auto">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-white font-bold">{{ game.name }}</span>
          <span v-if="game.type === 'tournament'" class="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-semibold">🏆</span>
          <span v-else class="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-semibold">💵</span>
        </div>
        <div class="text-[10px] text-gray-400">{{ $t('game.host') }}: {{ game.hostName || $t('common.unknown') }}</div>
      </div>
      <div class="text-right">
        <div class="text-[10px] text-gray-400">{{ $t('game.pot') }}</div>
        <div class="font-mono text-amber-400 font-bold">{{ formatNumber(totalPot) }}</div>
      </div>
    </div>

    <!-- Timed game (structure applied): live level / countdown strip -->
    <button
      v-if="clockIsTimed"
      type="button"
      class="w-full mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs flex items-center justify-between gap-2 text-left"
      @click="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"
    >
      <span class="text-amber-300 font-semibold">
        <template v-if="clockIsBreak">☕ {{ $t('tournament.breakTime') }}</template>
        <template v-else>
          {{ $t('tournament.level') }} {{ clockLevel }} ·
          {{ formatNumber(clockBlinds.small) }}/{{ formatNumber(clockBlinds.big) }}<span v-if="clockBlinds.ante"> ({{ formatNumber(clockBlinds.ante) }})</span>
        </template>
      </span>
      <span v-if="clockStatus === 'ended'" class="text-rose-300 font-semibold">{{ $t('timed.timeUp') }}</span>
      <span v-else-if="clockStatus === 'waiting'" class="text-gray-400">{{ $t('tournament.waitingToStart') }}</span>
      <span v-else class="text-gray-300">
        {{ $t('timed.timeToEnd') }} <span class="font-mono text-white">{{ clockTimeToEnd }}</span>
      </span>
    </button>
    <div
      v-if="timedBuyInClosed"
      class="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200"
    >
      <i class="fas fa-lock mr-1"></i>{{ $t('timed.buyInClosed') }}
    </div>

    <!-- Player cards -->
    <div class="space-y-3 mt-2">
      <PlayerCard
        v-for="player in game.players"
        :key="player.id"
        :player="player"
        :can-bind="!myPlayer && !player.uid"
        :is-my-card="player.uid === user?.uid"
        :buy-in-disabled="timedBuyInClosed"
        @bind="handleBind"
        @invite="handleInvite"
        @add-buy="handleAddBuy"
        @edit="handleEditPlayer"
      />
    </div>

    <!-- Action buttons -->
    <div class="mt-8 flex gap-3 justify-center flex-wrap">
      <BaseButton @click="handleCopyId" variant="ghost" size="sm">
        <i class="fas fa-copy mr-1"></i>{{ $t('game.copyId') }}
      </BaseButton>
      <BaseButton v-if="liffReady" @click="handleShareToLine" variant="ghost" size="sm" class="!text-[#06C755]">
        <i class="fab fa-line mr-1"></i>{{ $t('game.shareToLine') }}
      </BaseButton>
      <BaseButton @click="showSettlement = true" variant="secondary">
        {{ $t('game.settlement') }}
      </BaseButton>
      <BaseButton
        v-if="game.tournamentSessionId"
        @click="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"
        variant="ghost"
        size="sm"
      >
        <i class="fas mr-1 text-amber-400" :class="clockIsTimed ? 'fa-clock' : 'fa-trophy'"></i>{{ $t('tournament.viewClock') }}
      </BaseButton>
    </div>

    <!-- Transaction Log -->
    <div class="mt-6">
      <TransactionLog
        :transactions="transactions"
        :host-uid="game.hostUid"
        :error="txError"
        :loading="txLoading"
        @undo="handleUndoBuyIn"
      />
    </div>

    <!-- Record hand button -->
    <BaseButton
      @click="showHandRecord = true"
      variant="primary"
      fullWidth
      class="mt-4"
    >
      <i class="fas fa-save mr-2"></i>{{ $t('hand.recordHand') }}
    </BaseButton>

    <!-- Hand history -->
    <div v-if="hands.length > 0" class="mt-6">
      <HandHistoryList :hands="hands" @select="handleSelectHand" />
    </div>

    <BaseButton
      v-if="isHost"
      @click="handleCloseGame"
      variant="danger"
      fullWidth
      class="mt-4"
      size="sm"
    >
      {{ $t('game.closeGame') }}
    </BaseButton>

    <!-- Add player button (a new seat brings a buy-in: hidden past a timed cutoff) -->
    <button
      v-if="!timedBuyInClosed"
      @click="showAddPlayer = true"
      class="fixed bottom-24 right-4 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-xl shadow-lg hover:bg-amber-600 transition active:scale-95"
    >
      <i class="fas fa-plus"></i>
    </button>

    <!-- Add Player Modal -->
    <BaseModal v-model="showAddPlayer" :title="$t('game.addPlayer')">
      <BaseInput v-model="newPlayerName" :placeholder="$t('game.playerName')" class="mb-4" />
      <!-- Buy-in is fixed by the room preset (baseBuyIn); not editable here -->
      <div class="mb-4 flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
        <span class="text-xs text-gray-400">{{ $t('game.buyIn') }}</span>
        <span class="text-white font-semibold">{{ formatNumber(newPlayerBuyIn) }}</span>
      </div>
      <BaseButton @click="handleAddPlayer" variant="primary" fullWidth>
        {{ $t('common.confirm') }}
      </BaseButton>
    </BaseModal>

    <!-- Edit Player Modal -->
    <BaseModal v-model="showEditPlayer" :title="editingPlayer?.name">
      <template #header>
        <div class="flex justify-between w-full items-center">
          <h3 class="text-white font-bold">{{ editingPlayer?.name }}</h3>
          <BaseButton @click="handleRemovePlayer" variant="danger" size="sm">
            {{ $t('common.delete') }}
          </BaseButton>
        </div>
      </template>
      
      <div class="space-y-4">
        <div>
          <label class="text-xs text-gray-400 block mb-2">{{ $t('game.buyInChips') }}</label>
          <div class="text-white font-mono text-xl text-center mb-2">{{ editedBuyIn }}</div>
          <div class="flex gap-2 items-center justify-center">
            <BaseButton @click="decrementBuyInGroup" size="sm">-</BaseButton>
            <span class="text-white font-mono text-lg px-4">{{ buyInGroups }} {{ $t('game.buyInGroups') }}</span>
            <BaseButton @click="incrementBuyInGroup" size="sm">+</BaseButton>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-2">{{ $t('game.settlementChips') }}</label>
          <BaseInput
            v-model.number="editingPlayer.stack"
            type="number"
            :placeholder="$t('game.settlementPlaceholder')"
          />
        </div>
        <BaseButton @click="handleSavePlayer" variant="secondary" fullWidth>
          {{ $t('common.save') }}
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Settlement Modal -->
    <BaseModal v-model="showSettlement" :title="$t('game.settlement')">
      <div class="flex justify-between bg-slate-900 p-3 rounded mb-4">
        <span class="text-gray-400 text-sm">{{ $t('game.exchangeRate') }}</span>
        <BaseInput v-model.number="exchangeRate" type="number" class="w-20 text-center" />
      </div>
      
      <div class="space-y-2 mb-4 max-h-60 overflow-y-auto">
        <div
          v-for="p in sortedPlayers"
          :key="p.id"
          class="flex justify-between text-sm py-1 border-b border-slate-700"
        >
          <span class="text-white">{{ p.name }}</span>
          <span :class="calculateNet(p) >= 0 ? 'text-emerald-400' : 'text-rose-400'">
            {{ formatCash(calculateNet(p), exchangeRate) }}
          </span>
        </div>
      </div>
      
      <div v-if="gap !== 0" class="text-rose-400 text-center text-xs mb-4">
        {{ $t('game.gap') }}: {{ formatSignedNumber(gap) }}
      </div>
      
      <div class="grid gap-3">
        <BaseButton @click="handleCopyReport" variant="ghost" fullWidth>
          {{ $t('game.copyReport') }}
        </BaseButton>
        <BaseButton @click="handleSettle" variant="primary" fullWidth>
          {{ $t('game.finishAndSave') }}
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Hand Record Sheet -->
    <HandRecordSheet
      v-model="showHandRecord"
      :game-id="gameId"
      :players="game.players"
      :base-buy-in="game.baseBuyIn || DEFAULT_BUY_IN"
      @saved="handleHandRecordSaved"
    />

    <!-- Hand History Detail Modal -->
    <HandHistoryDetail
      v-model="showHandDetail"
      :hand="selectedHand"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useAuth } from '../composables/useAuth.js';
import { useGameStore } from '../store/modules/game.js';
import { useHand } from '../composables/useHand.js';
import { useTransactions } from '../composables/useTransactions.js';
import { useLiff } from '../composables/useLiff.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLoading } from '../composables/useLoading.js';
import { useUserStore } from '../store/modules/user.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { BUY_IN_CLOSED } from '../utils/timedStructure.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import PlayerCard from '../components/game/PlayerCard.vue';
import TransactionLog from '../components/game/TransactionLog.vue';
import HandRecordSheet from '../components/game/HandRecordSheet.vue';
import HandHistoryList from '../components/game/HandHistoryList.vue';
import HandHistoryDetail from '../components/game/HandHistoryDetail.vue';
import { formatNumber, formatSignedNumber, formatCash, calculateNet } from '../utils/formatters.js';
import { generateTextReport } from '../utils/exportReport.js';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_BUY_IN } from '../utils/constants.js';
import { consumeSessionReturn } from '../utils/sessionReturn.js';
import { buildCashSettlementReport } from '../utils/cashSettlementFlow.js';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { user, displayName } = useAuth();
const userStore = useUserStore();
const gameStore = useGameStore();
const { game, gameId, totalPot, totalStack, gap, isHost, myPlayer, error: gameError } = storeToRefs(gameStore);
const { addPlayer, updatePlayer, removePlayer, bindSeat, settleGame, closeGame, checkGameStatus, joinAsNewPlayer, joinGameListener, clearCurrentGame } = gameStore;
const { hands, listenToHandRecords, cleanup: cleanupHands } = useHand();
const { transactions, txLoading, txError, listenerReady, startListening: startTxListening, stopListening: stopTxListening, recordBuyIn, recordAction, recordDirect, undoBuyIn } = useTransactions(gameId);
const {
  sendBuyInMessage, sendUndoMessage, sendSettlementMessage, shareGameInvite,
  lineNotifyEnabled, isInLineClient, isInitialized: liffReady,
} = useLiff();
const { success, warning, error: showError, copyWithNotification } = useNotification();
const { confirm } = useConfirm();
const { withLoading } = useLoading();

// Timed game (限時賽 with a blind structure): follow the linked clock for the
// level strip and the buy-in cutoff. Following it here also lets the host's
// device advance / end the clock without the clock page open.
const {
  isTimed: clockIsTimed,
  isBuyInClosed: clockBuyInClosed,
  timeToEnd: clockTimeToEnd,
  currentLevel: clockLevel,
  currentBlinds: clockBlinds,
  isBreak: clockIsBreak,
  status: clockStatus,
  joinSession: joinClock,
  cleanup: cleanupClock,
} = useTournamentClock();

watch(
  () => (game.value?.type === 'live' ? game.value?.tournamentSessionId : null),
  (sid, prevSid) => {
    if (sid === prevSid) return;
    if (sid) joinClock(sid);
    else cleanupClock();
  },
  { immediate: true },
);

const timedBuyInClosed = computed(() => clockIsTimed.value && clockBuyInClosed.value);

/** Toast for a failed ledger write — the cutoff gets its own message. */
const warnLedgerFailed = () => {
  warning(txError.value === BUY_IN_CLOSED ? t('timed.buyInClosed') : t('game.saveFailed'));
};

const showAddPlayer = ref(false);
const showEditPlayer = ref(false);
const showSettlement = ref(false);
const showHandRecord = ref(false);
const showHandDetail = ref(false);
const newPlayerName = ref('');
const newPlayerBuyIn = ref(DEFAULT_BUY_IN);
const editingPlayer = ref(null);
const exchangeRate = ref(DEFAULT_EXCHANGE_RATE);
const selectedHand = ref(null);
const autoJoinLoading = ref(false);
const buyInProcessing = ref(new Set());

/**
 * Auto-join flow: when opened via /game/:gameId (e.g. LIFF deep link)
 * 1. Check if already in this game → just listen
 * 2. If not in game → auto-join as new player
 */
onMounted(async () => {
  const targetGameId = route.params.gameId;
  if (!targetGameId) return; // opened via /game (no param), game store already loaded
  if (game.value?.id === targetGameId) return; // already loaded

  autoJoinLoading.value = true;
  try {
    const result = await checkGameStatus(targetGameId);

    if (result.status === 'joined') {
      // Already in this game, just start listening
      await joinGameListener(targetGameId);
    } else if (result.status === 'open') {
      // Not in game yet — auto-join as new player with baseBuyIn
      const baseBuyIn = result.baseBuyIn || DEFAULT_BUY_IN;
      const joined = await joinAsNewPlayer(targetGameId, baseBuyIn);
      if (!joined && gameError.value === BUY_IN_CLOSED) {
        warning(t('timed.joinClosed'));
        router.push('/lobby');
      }
    } else {
      // Game not found or ended
      router.push('/lobby');
    }
  } catch (err) {
    console.error('[GameView] Auto-join failed:', err);
    router.push('/lobby');
  } finally {
    autoJoinLoading.value = false;
  }
});

// Listen to hand records when game is loaded
watch(() => gameId.value, (newGameId) => {
  if (newGameId) {
    listenToHandRecords(newGameId);
  } else {
    cleanupHands();
  }
}, { immediate: true });

// Record initial buy-in transactions for existing players when game first loads
// This ensures the transaction log isn't empty for games created before transaction tracking
let initialBuyInsRecorded = false;
watch(
  [() => gameId.value, () => game.value, transactions, listenerReady],
  async ([gid, g, txList, ready]) => {
    if (!gid || !g || !g.players || initialBuyInsRecorded) return;
    // Wait until the listener has received its initial snapshot
    if (!ready) return;
    // If transactions already exist, no need to record initial buy-ins
    if (txList.length > 0) {
      initialBuyInsRecorded = true;
      return;
    }
    // If there's an error with the listener, don't try to record
    if (txError.value) {
      initialBuyInsRecorded = true;
      return;
    }
    initialBuyInsRecorded = true;
    // Record initial buy-in for each player using direct write (no CF)
    // to avoid doubling the buyIn in the game's players array
    for (const player of g.players) {
      if (player.buyIn > 0) {
        await recordDirect(
          player.id,
          player.uid || null,
          player.name,
          'buy_in',
          player.buyIn,
        );
      }
    }
  },
  { immediate: true },
);

// Reset newPlayerBuyIn when add player modal opens
watch(() => showAddPlayer.value, (isOpen) => {
  if (isOpen) {
    newPlayerBuyIn.value = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  }
});

// Pre-fill exchangeRate from game.rate (set at creation via cash preset) when settlement modal opens
watch(() => showSettlement.value, (isOpen) => {
  if (isOpen && game.value?.rate) {
    exchangeRate.value = game.value.rate;
  }
});

const sortedPlayers = computed(() => {
  if (!game.value) return [];
  return [...game.value.players].sort((a, b) => calculateNet(b) - calculateNet(a));
});

// The edit modal tracks the buy-in change as a delta on top of the LIVE seat,
// not an absolute copy taken when the modal opened — otherwise a buy-in made
// on another device while the modal is open would be reverted on save.
const editBuyInDelta = ref(0);

const liveEditingPlayer = computed(() =>
  game.value?.players?.find((p) => p.id === editingPlayer.value?.id) || null
);

const editedBuyIn = computed(() => {
  const liveBuyIn = liveEditingPlayer.value?.buyIn ?? editingPlayer.value?.buyIn ?? 0;
  return liveBuyIn + editBuyInDelta.value;
});

const buyInGroups = computed(() => {
  if (!editingPlayer.value) return 0;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  return Math.floor(editedBuyIn.value / baseBuyIn);
});

const incrementBuyInGroup = () => {
  if (!editingPlayer.value) return;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  // Align to next full group
  editBuyInDelta.value += (buyInGroups.value + 1) * baseBuyIn - editedBuyIn.value;
};

const decrementBuyInGroup = () => {
  if (!editingPlayer.value) return;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  const currentGroups = buyInGroups.value;
  const target = Math.max(baseBuyIn, (currentGroups > 1 ? currentGroups - 1 : 1) * baseBuyIn);
  editBuyInDelta.value += target - editedBuyIn.value;
};

const handleAddPlayer = async () => {
  // The modal may have been opened just before the cutoff hit.
  if (timedBuyInClosed.value) {
    warning(t('timed.buyInClosed'));
    showAddPlayer.value = false;
    return;
  }
  await withLoading(async () => {
    const playerName = newPlayerName.value || 'Player';
    // Always use the room preset's buy-in (one group), never a hand-typed amount
    const buyInAmount = game.value?.baseBuyIn || DEFAULT_BUY_IN;
    const newPlayer = await addPlayer(playerName, buyInAmount);
    if (newPlayer) {
      await recordAction(newPlayer.id, null, playerName, 'join', 0);
    } else {
      // The store re-checks the cutoff atomically; this is the authoritative refusal.
      warning(gameError.value === BUY_IN_CLOSED ? t('timed.buyInClosed') : t('game.saveFailed'));
    }
    showAddPlayer.value = false;
    newPlayerName.value = '';
    newPlayerBuyIn.value = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  }, t('loading.saving'));
};

const handleEditPlayer = (player) => {
  editingPlayer.value = { ...player };
  editBuyInDelta.value = 0;
  showEditPlayer.value = true;
};

const handleSavePlayer = async () => {
  await withLoading(async () => {
    const p = editingPlayer.value;
    const fields = { stack: p.stack };
    // One write either way: a buy-in correction carries the stack with it
    // (roster + audit record in the same transaction).
    const ok = editBuyInDelta.value !== 0
      ? await recordAction(p.id, p.uid || null, p.name, 'modify', editBuyInDelta.value, fields)
      : await updatePlayer({ id: p.id, ...fields });
    if (!ok) {
      warnLedgerFailed();
      return;
    }
    showEditPlayer.value = false;
    editingPlayer.value = null;
  }, t('loading.saving'));
};

const handleRemovePlayer = async () => {
  const shouldRemove = await confirm({
    message: t('game.confirmRemove'),
    type: 'danger'
  });
  if (shouldRemove) {
    await withLoading(async () => {
      const removedPlayer = { ...editingPlayer.value };
      if (!(await removePlayer(editingPlayer.value))) {
        warning(t('game.saveFailed'));
        return;
      }
      await recordAction(removedPlayer.id, removedPlayer.uid || null, removedPlayer.name, 'remove', 0);
      showEditPlayer.value = false;
      editingPlayer.value = null;
    }, t('loading.removing'));
  }
};

const handleBind = async (player) => {
  const shouldBind = await confirm({
    message: t('game.confirmBind'),
    type: 'info'
  });
  if (shouldBind) {
    await withLoading(async () => {
      const originalSeatName = player.name;
      if (!(await bindSeat(player))) {
        warning(t('game.saveFailed'));
        return;
      }
      await recordAction(player.id, null, originalSeatName, 'bind', 0);
    }, t('loading.binding'));
  }
};

const handleInvite = async (player) => {
  const url = `${window.location.origin}${window.location.pathname}?game=${game.value.id}&seat=${player.id}`;
  await copyWithNotification(url, t('common.copy'));
};

const handleShareToLine = async () => {
  const shared = await shareGameInvite(
    game.value.name,
    game.value.id,
    game.value.hostName || displayName.value,
  );
  if (shared) {
    success(t('game.shareSuccess'));
  }
};

const handleAddBuy = async (player) => {
  // Prevent rapid duplicate buy-ins for the same player
  if (buyInProcessing.value.has(player.id)) return;
  buyInProcessing.value.add(player.id);
  try {
    const buyInAmount = game.value?.baseBuyIn || DEFAULT_BUY_IN;
    const result = await recordBuyIn(player.id, player.uid || null, player.name, buyInAmount, 'buy_in');
    if (result) {
      success(t('transaction.buyInSuccess'));
      const gameType = game.value?.type || 'live';
      sendBuyInMessage(displayName.value, player.name, buyInAmount, game.value?.name, game.value?.id, {
        totalBuyIn: result.totalBuyIn,
        baseBuyIn: buyInAmount,
        gameType,
      });
    } else {
      warnLedgerFailed();
    }
  } finally {
    buyInProcessing.value.delete(player.id);
  }
};

/** Undo a buy-in transaction */
const handleUndoBuyIn = async (tx) => {
  const shouldUndo = await confirm({
    message: t('transaction.confirmUndo'),
    type: 'warning'
  });
  if (shouldUndo) {
    const result = await undoBuyIn(tx.txId);
    if (result) {
      success(t('transaction.undoSuccess'));
      sendUndoMessage(displayName.value, tx.targetName, Math.abs(tx.amount), game.value?.name, game.value?.id, {
        totalBuyIn: result.totalBuyIn,
        baseBuyIn: game.value?.baseBuyIn || Math.abs(tx.amount),
        gameType: game.value?.type || 'live',
      });
    } else {
      warnLedgerFailed();
    }
  }
};

const handleCopyId = async () => {
  await copyWithNotification(game.value.id, t('game.copyId'));
};

const handleCopyReport = async () => {
  const report = generateTextReport(game.value, exchangeRate.value);
  await copyWithNotification(report, t('game.copyReport'));
};

const handleSettle = async () => {
  // A non-zero stack/buy-in gap gets baked into the settlement snapshot
  // permanently — make the host acknowledge it explicitly.
  const shouldSettle = await confirm({
    message: gap.value !== 0
      ? t('game.confirmSettlementGap', { gap: formatSignedNumber(gap.value) })
      : t('game.confirmSettlement'),
    type: gap.value !== 0 ? 'danger' : 'warning'
  });
  if (shouldSettle) {
    const settleResult = await withLoading(
      () => settleGame(exchangeRate.value),
      t('loading.settling'),
    );
    if (!settleResult?.success) {
      showError(t(gameError.value || 'game.settlementFailed'));
      return;
    }

    showSettlement.value = false;
    const reportSent = await sendSettlementMessage(
      buildCashSettlementReport(settleResult),
    );
    if (lineNotifyEnabled.value && isInLineClient.value && !reportSent) {
      warning(t('game.settlementReportFailed'));
    }

    void userStore.waitForHistorySync(settleResult.gameId, settleResult.syncToken, {
      timeoutMs: 20000,
      fallbackToGameProjection: true,
    }).then((syncResult) => {
      if (syncResult.source === 'timeout') warning(t('loading.syncingPending'));
    }).catch(() => warning(t('loading.syncingPending')));

    const back = consumeSessionReturn(settleResult.gameId);
    clearCurrentGame();
    router.push(back || '/report');
  }
};

const handleCloseGame = async () => {
  const shouldClose = await confirm({
    message: t('game.confirmClose'),
    type: 'danger'
  });
  if (shouldClose) {
    await withLoading(async () => {
      const gId = game.value?.id;
      const closeSuccess = await closeGame();
      if (closeSuccess) {
        const back = consumeSessionReturn(gId);
        router.push(back || '/lobby');
      }
    }, t('loading.closing'));
  }
};

const handleHandRecordSaved = () => {
  success(t('common.save'));
};

const handleSelectHand = (hand) => {
  selectedHand.value = hand;
  showHandDetail.value = true;
};
</script>
