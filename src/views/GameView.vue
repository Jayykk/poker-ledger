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
  
  <div v-else class="pt-16 px-4 pb-28 w-full max-w-md mx-auto">
    <!-- Fixed header: total buy-in, share, host menu (解散房間) -->
    <RoomHeader
      :name="game.name"
      :host-name="game.hostName"
      badge="💵"
      badge-class="bg-emerald-500/20 text-emerald-400"
      :value-label="$t('room.totalBuyIn')"
      :value="formatNumber(totalPot)"
      :is-host="isHost"
      :in-line="isInLineClient"
      @copy-id="handleCopyId"
      @share-invite="handleShareInvite"
      @close-room="handleCloseGame"
    />

    <!-- Timed game (structure applied): clock card — tap → full clock,
         host can start / pause; shows the buy-in cutoff and time to the end -->
    <RoomClockCard
      v-if="clockIsTimed"
      class="mt-2"
      :status="clockStatus"
      :is-break="clockIsBreak"
      :level="clockLevel"
      :blinds="clockBlinds"
      :next-blinds="clockNextBlinds"
      :formatted-time="clockFormattedTime"
      :cutoff-level="Number(clockConfig?.reentryUntilLevel) || 0"
      :closed="timedBuyInClosed"
      :closed-label="$t('room.closed')"
      :detail="$t('room.endsIn', { time: clockTimeToEnd || '—' })"
      :ended-label="$t('timed.timeUp')"
      :can-control="clockIsHost"
      @open="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"
      @toggle="toggleClock"
    />

    <!-- Players, biggest winner first -->
    <div class="room-section mt-2">
      <div class="room-section-head">
        <span class="font-bold">{{ $t('room.playersN', { n: game.players.length }) }}</span>
        <span class="text-[11px] text-gray-400">{{ $t('room.stackTotal', { stack: formatNumber(totalStack), pot: formatNumber(totalPot) }) }}</span>
      </div>
      <PlayerCard
        v-for="player in sortedPlayers"
        :key="player.id"
        :player="player"
        :can-bind="!myPlayer && !player.uid"
        :is-my-card="player.uid === user?.uid"
        :buy-in-disabled="timedBuyInClosed"
        :base-buy-in="game.baseBuyIn || DEFAULT_BUY_IN"
        @bind="handleBind"
        @invite="handleInvite"
        @add-buy="handleAddBuy"
        @edit="handleEditPlayer"
      />
    </div>

    <!-- Transaction Log (底部列「紀錄」捲到這裡) -->
    <div ref="logSection" class="mt-6 scroll-mt-20">
      <TransactionLog
        :transactions="transactions"
        :host-uid="game.hostUid"
        :error="txError"
        :loading="txLoading"
        @undo="handleUndoBuyIn"
      />
    </div>

    <!-- Hand history -->
    <div v-if="hands.length > 0" class="mt-6">
      <HandHistoryList :hands="hands" @select="handleSelectHand" />
    </div>

    <!-- Room actions above the bottom navigation (a new seat brings a
         buy-in: 加人 is hidden past a timed cutoff) -->
    <RoomActionBar>
      <button v-if="!timedBuyInClosed" type="button" class="bar-btn" @click="showAddPlayer = true">
        <i class="fas fa-plus"></i>{{ $t('room.addPlayer') }}
      </button>
      <button type="button" class="bar-btn" @click="scrollToLog">
        <i class="fas fa-list"></i>{{ $t('room.records') }}
      </button>
      <button type="button" class="bar-btn" @click="showHandRecord = true">
        <i class="fas fa-save"></i>{{ $t('room.hands') }}
      </button>
      <button type="button" class="bar-btn primary" @click="showSettlement = true">
        {{ $t('room.settle') }}
      </button>
    </RoomActionBar>

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
        <span class="text-gray-400 text-sm">
          {{ $t('cashPreset.buyInAmount') }}
          <span class="block text-[10px] text-gray-500">{{ $t('cashPreset.buyInAmountHint', { chips: formatNumber(settleBuyInChips) }) }}</span>
        </span>
        <div class="text-right">
          <div class="flex items-center gap-1 justify-end">
            <span class="text-white text-sm">$</span>
            <BaseInput v-model.number="settleBuyInAmount" type="number" min="0.01" class="w-24 text-center" />
          </div>
          <div class="text-[10px] text-gray-400 mt-1">{{ $t('cashPreset.rateDerived', { rate: formatRate(exchangeRate) }) }}</div>
        </div>
      </div>
      <div class="flex justify-between items-center bg-slate-900 p-3 rounded mb-4 gap-3">
        <span class="text-gray-400 text-sm">{{ $t('cashPreset.decimals') }}</span>
        <select
          v-model="settleDecimals"
          class="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
        >
          <option v-for="d in CASH_DECIMAL_OPTIONS" :key="String(d)" :value="d">{{ decimalsLabel(d) }}</option>
        </select>
      </div>
      
      <!-- 玩家 / 買入 / 籌碼 / 損益 (cash) -->
      <div class="mb-4 max-h-72 overflow-y-auto">
        <div class="cash-grid cash-head">
          <span>{{ $t('room.colPlayer') }}</span>
          <span class="text-right">{{ $t('room.buyIn') }}</span>
          <span class="text-right">{{ $t('room.stack') }}</span>
          <span class="text-right">{{ $t('room.colProfit') }}</span>
        </div>
        <div v-for="p in settlementPreview" :key="p.id" class="cash-grid">
          <span class="text-white truncate">{{ p.name }}</span>
          <span class="text-right font-mono text-gray-400">{{ formatNumber(p.buyIn) }}</span>
          <span class="text-right font-mono text-gray-300">{{ formatNumber(p.stack) }}</span>
          <span class="text-right font-mono" :class="p.cash >= 0 ? 'text-emerald-400' : 'text-rose-400'">
            {{ formatCashAmount(p.cash, settleDecimals) }}
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
import { useShare, appLink } from '../composables/useShare.js';
import { inviteText, cashSettlementText } from '../utils/shareText.js';
import { useLoading } from '../composables/useLoading.js';
import { useUserStore } from '../store/modules/user.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import RoomClockCard from '../components/tournament/RoomClockCard.vue';
import RoomHeader from '../components/game/RoomHeader.vue';
import RoomActionBar from '../components/game/RoomActionBar.vue';
import { BUY_IN_CLOSED } from '../utils/timedStructure.js';
import { rateFromBuyIn, resolveBuyInAmount, formatRate } from '../utils/buyInRate.js';
import {
  CASH_DECIMAL_OPTIONS, normalizeCashDecimals, withCashAmounts, rowCash, formatCashAmount,
} from '../utils/cashRounding.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import PlayerCard from '../components/game/PlayerCard.vue';
import TransactionLog from '../components/game/TransactionLog.vue';
import HandRecordSheet from '../components/game/HandRecordSheet.vue';
import HandHistoryList from '../components/game/HandHistoryList.vue';
import HandHistoryDetail from '../components/game/HandHistoryDetail.vue';
import { formatNumber, formatSignedNumber, calculateNet } from '../utils/formatters.js';
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
  lineNotifyEnabled, isInLineClient,
} = useLiff();
const { shareOut } = useShare();
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
  nextPlayLevelEntry: clockNextBlinds,
  formattedTime: clockFormattedTime,
  config: clockConfig,
  isHost: clockIsHost,
  startClock,
  pauseClock,
  joinSession: joinClock,
  cleanup: cleanupClock,
} = useTournamentClock();

const toggleClock = () => (clockStatus.value === 'running' ? pauseClock() : startClock());

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
// Settlement dialog: the host enters what one buy-in (baseBuyIn chips) cost;
// the rate (chips per currency unit, cash = chips / rate) is derived.
const settleBuyInChips = computed(() => game.value?.baseBuyIn || DEFAULT_BUY_IN);
const settleBuyInAmount = ref(null);
const exchangeRate = computed(() =>
  rateFromBuyIn(settleBuyInChips.value, settleBuyInAmount.value)
    || Number(game.value?.rate) || DEFAULT_EXCHANGE_RATE
);
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
  if (isOpen) {
    settleBuyInAmount.value = resolveBuyInAmount({
      buyInAmount: game.value?.buyInAmount,
      buyIn: settleBuyInChips.value,
      rate: Number(game.value?.rate) || DEFAULT_EXCHANGE_RATE,
    });
  }
  if (isOpen) settleDecimals.value = normalizeCashDecimals(game.value?.cashDecimals);
});

// Settlement rounding (decimal places) — defaults to the game's preset
// setting, changeable here. The preview uses the same zero-sum rounding the
// settlement Cloud Function applies, so what the host sees is what's saved.
const settleDecimals = ref(null);

function decimalsLabel(d) {
  if (d === null) return t('cashPreset.decimalsNone');
  return d === 0 ? t('cashPreset.decimalsInteger') : t('cashPreset.decimalsN', { n: d });
}

const settlementPreview = computed(() => {
  if (!game.value) return [];
  const rows = game.value.players.map((p) => ({
    id: p.id, name: p.name, buyIn: p.buyIn || 0, stack: p.stack || 0, profit: calculateNet(p),
  }));
  return withCashAmounts(rows, exchangeRate.value, settleDecimals.value)
    .map((row) => ({ ...row, cash: rowCash(row, exchangeRate.value) }))
    .sort((a, b) => b.cash - a.cash);
});

const logSection = ref(null);
const scrollToLog = () => logSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

// Invite: a LINE card inside LINE, else the system share sheet
const handleShareInvite = async () => {
  if (isInLineClient.value) {
    const shared = await shareGameInvite(
      game.value.name,
      game.value.id,
      game.value.hostName || displayName.value,
    );
    if (shared) success(t('game.shareSuccess'));
    return;
  }
  await shareOut({
    title: game.value.name,
    text: inviteText({
      gameName: game.value.name,
      hostName: game.value.hostName || displayName.value,
      url: appLink(`game/${game.value.id}`),
    }),
  });
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
  const report = generateTextReport(game.value, exchangeRate.value, { cashDecimals: settleDecimals.value });
  await copyWithNotification(report, t('game.copyReport'));
};

/** Outside LINE: settled — share the result? (the tap opens the share sheet) */
const askShareResult = () => confirm({
  title: t('share.settledTitle'),
  message: t('share.settledAsk'),
  confirmText: t('share.shareResult'),
  cancelText: t('share.noThanks'),
  type: 'info',
});

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
      () => settleGame(exchangeRate.value, settleDecimals.value),
      t('loading.settling'),
    );
    if (!settleResult?.success) {
      showError(t(gameError.value || 'game.settlementFailed'));
      return;
    }

    showSettlement.value = false;
    const report = buildCashSettlementReport(settleResult);
    if (isInLineClient.value) {
      // Inside LINE: the result card goes to this chat
      const reportSent = await sendSettlementMessage(report);
      if (lineNotifyEnabled.value && !reportSent) warning(t('game.settlementReportFailed'));
    } else if (await askShareResult()) {
      await shareOut({
        title: report.gameName,
        text: cashSettlementText({ ...report, url: report.gameId ? appLink(`report/${report.gameId}`) : undefined }),
      });
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

<style scoped>
.room-section {
  border-radius: 0.9rem;
  background: rgb(var(--tw-slate-800) / 0.6);
  border: 1px solid rgb(var(--tw-slate-600) / 0.5);
  overflow: hidden;
}
.room-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
  color: rgb(var(--tw-slate-200));
  background: rgb(var(--tw-slate-700) / 0.45);
}
.cash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.2rem 4.2rem 5rem;
  gap: 0.35rem;
  padding: 0.45rem 0;
  font-size: 0.82rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700));
}
.cash-head { font-size: 0.7rem; color: rgb(var(--tw-slate-400)); }
</style>
