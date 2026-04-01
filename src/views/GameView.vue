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
        <span class="text-white font-bold">{{ game.name }}</span>
        <div class="text-[10px] text-gray-400">{{ $t('game.host') }}: {{ game.hostName || $t('common.unknown') }}</div>
      </div>
      <div class="text-right">
        <div class="text-[10px] text-gray-400">{{ $t('game.pot') }}</div>
        <div class="font-mono text-amber-400 font-bold">{{ formatNumber(totalPot) }}</div>
      </div>
    </div>

    <!-- Player cards -->
    <div class="space-y-3 mt-2">
      <PlayerCard
        v-for="player in game.players"
        :key="player.id"
        :player="player"
        :can-bind="!myPlayer && !player.uid"
        :is-my-card="player.uid === user?.uid"
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

    <!-- Add player button -->
    <button
      @click="showAddPlayer = true"
      class="fixed bottom-24 right-4 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-xl shadow-lg hover:bg-amber-600 transition active:scale-95"
    >
      <i class="fas fa-plus"></i>
    </button>

    <!-- Add Player Modal -->
    <BaseModal v-model="showAddPlayer" :title="$t('game.addPlayer')">
      <BaseInput v-model="newPlayerName" :placeholder="$t('game.playerName')" class="mb-4" />
      <div class="mb-4">
        <label class="text-xs text-gray-400 block mb-2">{{ $t('game.buyIn') }}</label>
        <div class="flex gap-2 items-center">
          <BaseButton @click="decrementNewPlayerBuyIn" size="sm">-100</BaseButton>
          <BaseInput
            v-model.number="newPlayerBuyIn"
            type="number"
            :min="MIN_BUY_IN"
            :step="CHIP_STEP"
            class="flex-1 text-center"
          />
          <BaseButton @click="incrementNewPlayerBuyIn" size="sm">+100</BaseButton>
        </div>
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
          <div class="text-white font-mono text-xl text-center mb-2">{{ editingPlayer?.buyIn }}</div>
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
        {{ $t('game.gap') }}: {{ formatNumber(gap) }}
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
      :base-buy-in="game.baseBuyIn || 2000"
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
import { useAuth } from '../composables/useAuth.js';
import { useGame } from '../composables/useGame.js';
import { useHand } from '../composables/useHand.js';
import { useTransactions } from '../composables/useTransactions.js';
import { useLiff } from '../composables/useLiff.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLoading } from '../composables/useLoading.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import PlayerCard from '../components/game/PlayerCard.vue';
import TransactionLog from '../components/game/TransactionLog.vue';
import HandRecordSheet from '../components/game/HandRecordSheet.vue';
import HandHistoryList from '../components/game/HandHistoryList.vue';
import HandHistoryDetail from '../components/game/HandHistoryDetail.vue';
import { formatNumber, formatCash, calculateNet } from '../utils/formatters.js';
import { generateTextReport } from '../utils/exportReport.js';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_BUY_IN, MIN_BUY_IN, CHIP_STEP } from '../utils/constants.js';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { user, displayName } = useAuth();
const { game, gameId, totalPot, totalStack, gap, isHost, myPlayer, addPlayer, updatePlayer, removePlayer, bindSeat, settleGame, closeGame, checkGameStatus, joinAsNewPlayer, joinGameListener } = useGame();
const { hands, listenToHandRecords, cleanup: cleanupHands } = useHand();
const { transactions, txLoading, txError, listenerReady, startListening: startTxListening, stopListening: stopTxListening, recordBuyIn, recordAction, recordDirect, undoBuyIn } = useTransactions(gameId);
const { sendBuyInMessage, sendUndoMessage, sendSettlementMessage, shareGameInvite, isInLineClient, isInitialized: liffReady } = useLiff();
const { success, copyWithNotification } = useNotification();
const { confirm } = useConfirm();
const { withLoading } = useLoading();

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
      await joinAsNewPlayer(targetGameId);
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

const sortedPlayers = computed(() => {
  if (!game.value) return [];
  return [...game.value.players].sort((a, b) => calculateNet(b) - calculateNet(a));
});

const buyInGroups = computed(() => {
  if (!editingPlayer.value) return 0;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  return Math.floor(editingPlayer.value.buyIn / baseBuyIn);
});

const incrementBuyInGroup = () => {
  if (!editingPlayer.value) return;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  // Align to next full group
  const currentGroups = Math.floor(editingPlayer.value.buyIn / baseBuyIn);
  editingPlayer.value.buyIn = (currentGroups + 1) * baseBuyIn;
};

const decrementBuyInGroup = () => {
  if (!editingPlayer.value) return;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  const currentGroups = Math.floor(editingPlayer.value.buyIn / baseBuyIn);
  editingPlayer.value.buyIn = Math.max(baseBuyIn, (currentGroups > 1 ? currentGroups - 1 : 1) * baseBuyIn);
};

const incrementNewPlayerBuyIn = () => {
  newPlayerBuyIn.value = (newPlayerBuyIn.value || 0) + CHIP_STEP;
};

const decrementNewPlayerBuyIn = () => {
  if (newPlayerBuyIn.value > MIN_BUY_IN) {
    newPlayerBuyIn.value = Math.max(MIN_BUY_IN, newPlayerBuyIn.value - CHIP_STEP);
  }
};

const handleAddPlayer = async () => {
  await withLoading(async () => {
    const playerName = newPlayerName.value || 'Player';
    await addPlayer(playerName, newPlayerBuyIn.value);
    await recordAction(null, playerName, 'join', 0);
    showAddPlayer.value = false;
    newPlayerName.value = '';
    newPlayerBuyIn.value = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  }, t('loading.saving'));
};

const handleEditPlayer = (player) => {
  editingPlayer.value = { ...player };
  showEditPlayer.value = true;
};

const handleSavePlayer = async () => {
  await withLoading(async () => {
    const originalPlayer = game.value?.players?.find((p) => p.id === editingPlayer.value.id);
    const buyInChanged = originalPlayer && originalPlayer.buyIn !== editingPlayer.value.buyIn;
    await updatePlayer(editingPlayer.value);
    if (buyInChanged) {
      await recordAction(
        editingPlayer.value.uid || null,
        editingPlayer.value.name,
        'modify',
        editingPlayer.value.buyIn - originalPlayer.buyIn,
      );
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
      await removePlayer(editingPlayer.value);
      await recordAction(removedPlayer.uid || null, removedPlayer.name, 'remove', 0);
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
      await bindSeat(player);
      await recordAction(null, originalSeatName, 'bind', 0);
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
  const buyInAmount = game.value?.baseBuyIn || 2000;
  const result = await recordBuyIn(player.uid || null, player.name, buyInAmount, 'buy_in');
  if (result) {
    // If the transaction was recorded via fallback (direct write),
    // we also need to update the player's buyIn in the game document
    if (result.fallback) {
      const updatedPlayer = { ...player, buyIn: (player.buyIn || 0) + buyInAmount };
      await updatePlayer(updatedPlayer);
    }
    success(t('transaction.buyInSuccess'));
    sendBuyInMessage(displayName.value, player.name, buyInAmount, game.value?.name);
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
      // If undo was via fallback, update the player's buyIn directly
      if (result.fallback && tx.targetName) {
        const player = game.value?.players?.find(
          p => tx.targetUid ? p.uid === tx.targetUid : p.name === tx.targetName
        );
        if (player) {
          const updatedPlayer = { ...player, buyIn: Math.max(0, (player.buyIn || 0) - Math.abs(tx.amount || 0)) };
          await updatePlayer(updatedPlayer);
        }
      }
      success(t('transaction.undoSuccess'));
      sendUndoMessage(displayName.value, tx.targetName, Math.abs(tx.amount), game.value?.name);
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
  const shouldSettle = await confirm({
    message: t('game.confirmSettlement'),
    type: 'warning'
  });
  if (shouldSettle) {
    await withLoading(async () => {
      // Generate report text before settling (game data still available)
      const report = generateTextReport(game.value, exchangeRate.value);
      const settleSuccess = await settleGame(exchangeRate.value);
      if (settleSuccess) {
        showSettlement.value = false;
        // Send settlement report to LINE chat (user's own name, free)
        sendSettlementMessage(report);
        router.push('/report');
      }
    }, t('loading.settling'));
  }
};

const handleCloseGame = async () => {
  const shouldClose = await confirm({
    message: t('game.confirmClose'),
    type: 'danger'
  });
  if (shouldClose) {
    await withLoading(async () => {
      const closeSuccess = await closeGame();
      if (closeSuccess) {
        router.push('/lobby');
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
