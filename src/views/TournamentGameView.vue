<template>
  <!-- Loading -->
  <div v-if="autoJoinLoading" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
    <LoadingSpinner :text="$t('loading.joining')" />
  </div>

  <!-- No game -->
  <div v-else-if="!game" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
    <p>{{ $t('game.noActiveGame') }}</p>
    <BaseButton @click="$router.push('/lobby')" variant="primary">
      {{ $t('nav.lobby') }}
    </BaseButton>
  </div>

  <!-- Main view -->
  <div v-else class="pt-16 px-4 pb-40">
    <div v-if="isSyncingHistory" class="mb-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
      <div class="flex items-center gap-2">
        <i class="fas fa-spinner fa-spin"></i>
        <span>{{ syncStatusMessage }}</span>
      </div>
    </div>

    <!-- Fixed header: prize pool, share, host menu (解散房間) -->
    <RoomHeader
      :name="game.name"
      :host-name="game.hostName"
      badge="🏆"
      :value-label="$t('room.prizePool')"
      :value="`$${formatNumber(prizePool)}`"
      :sub-value="bountyPerHead > 0 ? `🎯 ${$t('bounty.perHead', { amount: formatNumber(bountyPerHead) })}` : ''"
      :is-host="isHost"
      :can-share-line="liffReady"
      @copy-id="handleCopyId"
      @share-line="handleShareToLine"
      @close-room="handleCloseGame"
    />

    <!-- Clock card: tap → full clock; host can start / pause here -->
    <RoomClockCard
      v-if="game.tournamentSessionId && tournamentSession"
      class="mt-2"
      :status="clockStatus"
      :is-break="clockIsBreak"
      :level="clockLevel"
      :blinds="clockBlinds"
      :next-blinds="clockNextBlinds"
      :formatted-time="clockFormattedTime"
      :cutoff-level="reentryUntilLevel"
      :closed="reentryUntilLevel > 0 && !reentriesOpen"
      :closed-label="$t('room.closed')"
      :detail="$t('room.playersLeft', { left: activePlayers.length, total: (game.players || []).length })"
      :ended-label="$t('room.ended')"
      :can-control="clockIsHost"
      @open="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"
      @toggle="toggleClock"
    />

    <!-- Still in -->
    <div class="room-section mt-2">
      <div class="room-section-head">
        <span class="font-bold">{{ $t('room.inPlayN', { n: activePlayers.length }) }}</span>
      </div>
      <TournamentPlayerCard
        v-for="player in activePlayers"
        :key="player.id"
        :player="player"
        :base-buy-in="game?.baseBuyIn || 0"
        :is-champion="isChampion(player)"
        :bounty-per-head="bountyPerHead"
        @eliminate="handleEliminate"
        @edit="handleEditPlayer"
        @remove="handleRemoveFromRow"
      />
    </div>

    <!-- Out: re-entry straight from the row while it's open -->
    <div v-if="eliminatedPlayers.length" class="room-section mt-3">
      <div class="room-section-head">
        <span class="font-bold">{{ $t('room.eliminatedN', { n: eliminatedPlayers.length }) }}</span>
      </div>
      <TournamentPlayerCard
        v-for="player in eliminatedPlayers"
        :key="player.id"
        :player="player"
        :can-reentry="canReentry(player)"
        :reentry-blocked="reentryBlocked(player)"
        :base-buy-in="game?.baseBuyIn || 0"
        :is-champion="isChampion(player)"
        :bounty-per-head="bountyPerHead"
        :knocked-out-by="knockedOutBy[player.id] || ''"
        @reentry="handleReentry"
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

    <!-- Room actions above the bottom navigation -->
    <RoomActionBar>
      <button v-if="isHost && reentriesOpen" type="button" class="bar-btn" @click="showAddPlayer = true">
        <i class="fas fa-plus"></i>{{ $t('room.addPlayer') }}
      </button>
      <button type="button" class="bar-btn" @click="scrollToLog">
        <i class="fas fa-list"></i>{{ $t('room.records') }}
      </button>
      <button type="button" class="bar-btn" @click="showHandRecord = true">
        <i class="fas fa-save"></i>{{ $t('room.hands') }}
      </button>
      <button v-if="isParticipant" type="button" class="bar-btn primary" @click="showSettlement = true">
        {{ $t('room.settle') }}
      </button>
    </RoomActionBar>

    <!-- Add Player Modal -->
    <BaseModal v-model="showAddPlayer" :title="$t('tournament.addPlayer')">
      <BaseInput v-model="newPlayerName" :placeholder="$t('tournament.playerName')" class="mb-4" />
      <BaseButton @click="handleAddPlayer" variant="primary" fullWidth>
        {{ $t('common.confirm') }}
      </BaseButton>
    </BaseModal>

    <!-- Edit Player Modal (name only) -->
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
          <label class="text-xs text-gray-400 block mb-2">{{ $t('tournament.playerName') }}</label>
          <BaseInput v-model="editingPlayer.name" />
        </div>
        <BaseButton @click="handleSavePlayer" variant="secondary" fullWidth>
          {{ $t('common.save') }}
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Settlement Modal -->
    <BaseModal v-model="showSettlement" :title="$t('tournament.settleTournament')">
      <!-- Prize Pool -->
      <div class="flex justify-between bg-slate-900 p-3 rounded mb-4">
        <span class="text-gray-400 text-sm">{{ $t('room.prizePool') }}</span>
        <span class="text-amber-400 font-bold font-mono">${{ formatNumber(prizePool) }}</span>
      </div>
      <div v-if="bountyPerHead > 0" class="flex justify-between bg-slate-900 p-3 rounded mb-4 -mt-2">
        <span class="text-gray-400 text-sm">🎯 {{ $t('room.bountyTotal') }}</span>
        <span class="text-rose-300 font-bold font-mono">${{ formatNumber(settlementTotals.bounty) }}</span>
      </div>

      <!-- Payout table -->
      <div v-if="payoutRatios.length > 0" class="mb-4">
        <div class="text-xs text-gray-400 mb-2">{{ $t('room.payouts') }}</div>
        <div class="space-y-1">
          <div
            v-for="p in payoutDetails"
            :key="p.place"
            class="flex justify-between text-sm py-1 border-b border-slate-700"
          >
            <span class="text-gray-300">
              #{{ p.place }}
              <span v-if="p.playerName" class="text-white ml-1">{{ p.playerName }}</span>
              <span v-else class="text-gray-500 ml-1">—</span>
            </span>
            <span class="text-emerald-400 font-mono">${{ formatNumber(p.prize) }}</span>
          </div>
        </div>
      </div>

      <!-- Player results: 名次 / 玩家 / 獎金 / 賞金 / 損益 -->
      <div class="mb-4 max-h-72 overflow-y-auto">
        <div class="settle-grid settle-head" :class="{ ko: bountyPerHead > 0 }">
          <span>{{ $t('room.colPlace') }}</span>
          <span>{{ $t('room.colPlayer') }}</span>
          <span class="text-right">{{ $t('room.colPrize') }}</span>
          <span v-if="bountyPerHead > 0" class="text-right">{{ $t('room.colBounty') }}</span>
          <span class="text-right">{{ $t('room.colProfit') }}</span>
        </div>
        <div
          v-for="p in settlementPlayers"
          :key="p.id"
          class="settle-grid"
          :class="{ ko: bountyPerHead > 0 }"
        >
          <span class="font-mono text-gray-400">{{ p.placement || '—' }}</span>
          <span class="text-white truncate">{{ p.name }}</span>
          <span class="text-right font-mono">${{ formatNumber(p.prize) }}</span>
          <span v-if="bountyPerHead > 0" class="text-right font-mono text-rose-300">${{ formatNumber(p.bounty) }}</span>
          <span class="text-right font-mono" :class="p.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'">
            {{ p.netProfit > 0 ? '+' : p.netProfit < 0 ? '−' : '' }}${{ formatNumber(Math.abs(p.netProfit)) }}
          </span>
        </div>
        <div class="flex justify-between text-[11px] text-gray-500 mt-2">
          <span>{{ $t('tournament.totalBuyIn') }} ${{ formatNumber(settlementTotals.buyIn) }}</span>
          <span>{{ $t('room.sumCheck', { amount: formatNumber(settlementTotals.profit) }) }}</span>
        </div>
      </div>

      <!-- Warnings -->
      <div v-if="playersStillInPlay.length > 0" class="text-amber-400 text-center text-xs mb-4">
        <i class="fas fa-exclamation-triangle mr-1"></i>
        {{ playersStillInPlay.length }} {{ $t('tournament.inPlay') }}
        <div v-if="canDeal" class="text-emerald-400 mt-1">
          <i class="fas fa-handshake mr-1"></i>{{ $t('tournament.dealHint') }}
        </div>
      </div>

      <div class="grid gap-3">
        <BaseButton @click="handleSettle" variant="primary" fullWidth :disabled="playersStillInPlay.length > 0">
          {{ $t('common.confirm') }}
        </BaseButton>
        <BaseButton v-if="canDeal" @click="openDeal" variant="secondary" fullWidth>
          🤝 {{ $t('tournament.dealTitle') }}
        </BaseButton>
      </div>
    </BaseModal>

    <!-- KO: who knocked the player out -->
    <KnockoutModal
      v-model="showKnockout"
      :player="knockoutTarget"
      :candidates="knockoutCandidates"
      :per-entry="bountyPerHead"
      :warning="knockoutWarning"
      @confirm="handleKnockoutConfirm"
    />

    <!-- Deal Settlement Modal (協議結算) -->
    <DealSettlementModal
      v-model="showDeal"
      :players="activePlayers"
      :prizes="dealPrizes"
      :expected-chips="expectedChips"
      @confirm="handleDealConfirm"
    />

    <!-- Hand Record Sheet -->
    <HandRecordSheet
      v-model="showHandRecord"
      :game-id="gameId"
      :players="game?.players || []"
      @saved="handleHandRecordSaved"
    />

    <!-- Hand Detail Modal -->
    <HandHistoryDetail
      v-if="selectedHand"
      :hand="selectedHand"
      :show="showHandDetail"
      @close="showHandDetail = false; selectedHand = null"
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
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLoading } from '../composables/useLoading.js';
import { useUserStore } from '../store/modules/user.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import TournamentPlayerCard from '../components/game/TournamentPlayerCard.vue';
import DealSettlementModal from '../components/tournament/DealSettlementModal.vue';
import KnockoutModal from '../components/tournament/KnockoutModal.vue';
import RoomClockCard from '../components/tournament/RoomClockCard.vue';
import RoomHeader from '../components/game/RoomHeader.vue';
import RoomActionBar from '../components/game/RoomActionBar.vue';
import TransactionLog from '../components/game/TransactionLog.vue';
import HandRecordSheet from '../components/game/HandRecordSheet.vue';
import HandHistoryList from '../components/game/HandHistoryList.vue';
import HandHistoryDetail from '../components/game/HandHistoryDetail.vue';
import { formatNumber } from '../utils/formatters.js';
import { buildTournamentPrizeMap } from '../utils/settlementMath.js';
import { gameBountyPerEntry, gamePrizePool, finalBounty } from '../utils/bounty.js';
import { DEFAULT_BUY_IN } from '../utils/constants.js';
import { consumeSessionReturn } from '../utils/sessionReturn.js';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { user, displayName } = useAuth();
const userStore = useUserStore();
const gameStore = useGameStore();
const { game, gameId, isHost, error: gameError } = storeToRefs(gameStore);
const {
  addPlayer, updatePlayer, removePlayer,
  checkGameStatus, joinAsNewPlayer, joinGameListener,
  closeGame, eliminatePlayer, reentryPlayer, settleTournament, settleTournamentWithDeal, clearCurrentGame,
  undoEliminationTx, undoReentryTx,
} = gameStore;
const { sendBuyInMessage, sendUndoMessage, sendTournamentSettlementMessage, shareGameInvite, isInitialized: liffReady } = useLiff();
const { success, warning, error: showError, copyWithNotification } = useNotification();
const { confirm } = useConfirm();
const { withLoading } = useLoading();

const { hands, listenToHandRecords, cleanup: cleanupHands } = useHand();
const { transactions, txLoading, txError, recordAction, recordBuyIn, undoBuyIn } = useTransactions(gameId);

// Tournament session data (for reentryUntilLevel, payoutRatios)
const {
  session: tournamentSession,
  joinSession: joinTournamentSession,
  config: tournamentConfig,
  currentLevelIndex: clockLevelIndex,
  // clock card
  status: clockStatus,
  isBreak: clockIsBreak,
  currentLevel: clockLevel,
  currentBlinds: clockBlinds,
  nextPlayLevelEntry: clockNextBlinds,
  formattedTime: clockFormattedTime,
  isHost: clockIsHost,
  startClock,
  pauseClock,
} = useTournamentClock();

const toggleClock = () => (clockStatus.value === 'running' ? pauseClock() : startClock());

const showAddPlayer = ref(false);
const showEditPlayer = ref(false);
const showSettlement = ref(false);
const showDeal = ref(false);
const showHandRecord = ref(false);
const showHandDetail = ref(false);
const newPlayerName = ref('');
const editingPlayer = ref(null);
const selectedHand = ref(null);
const autoJoinLoading = ref(false);
const isSyncingHistory = ref(false);
const syncStatusMessage = ref('');

// ── Computed ──

const activePlayers = computed(() =>
  (game.value?.players || []).filter(p => !p.eliminated)
);

// Out, best finish first
const eliminatedPlayers = computed(() =>
  (game.value?.players || [])
    .filter((p) => p.eliminated)
    .sort((a, b) => (a.placement || 999) - (b.placement || 999))
);

// Active elimination records, latest first (seq is the global status order)
const eliminationRecords = computed(() =>
  (transactions.value || [])
    .filter((tx) => tx.type === 'eliminate' && tx.status === 'active')
    .sort((a, b) => (Number(b.restore?.seq) || 0) - (Number(a.restore?.seq) || 0))
);

// KO: who took each eliminated player's last head
const knockedOutBy = computed(() => {
  const out = {};
  for (const tx of eliminationRecords.value) {
    if (!tx.targetId || out[tx.targetId] !== undefined) continue;
    const names = (tx.restore?.bounty?.awards || []).map((a) => a.name).filter(Boolean);
    out[tx.targetId] = names.join('、');
  }
  return out;
});

const logSection = ref(null);
const scrollToLog = () => logSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// KO games: each entry's head comes out of the pool (utils/bounty.js)
const bountyPerHead = computed(() => (game.value ? gameBountyPerEntry(game.value) : 0));
const prizePool = computed(() => (game.value ? gamePrizePool(game.value) : 0));

const payoutRatios = computed(() =>
  tournamentConfig.value?.payoutRatios || []
);

const reentryUntilLevel = computed(() =>
  tournamentConfig.value?.reentryUntilLevel || 0
);

const maxReentries = computed(() =>
  tournamentConfig.value?.maxReentries ?? 0
);

const getPlayerReentryCount = (player) => {
  const baseBuyIn = game.value?.baseBuyIn || 1;
  return Math.max(0, Math.round((player.buyIn || 0) / baseBuyIn) - 1);
};

// Re-entry still open for others, but this player used them all up
const reentryBlocked = (player) => {
  if (!player.eliminated || !reentriesOpen.value || maxReentries.value <= 0) return '';
  return getPlayerReentryCount(player) + 1 >= maxReentries.value ? 'limit' : '';
};

// Check if reentries are globally still open (before cutoff level)
const reentriesOpen = computed(() => {
  // If no reentryUntilLevel configured, reentries are disabled entirely
  if (!tournamentConfig.value || !reentryUntilLevel.value) return false;
  const levels = tournamentConfig.value?.levels || [];
  const idx = clockLevelIndex.value ?? 0;
  let effectiveLevel = 0;
  for (let i = idx; i >= 0; i--) {
    if (!levels[i]?.isBreak) {
      effectiveLevel = levels[i]?.level ?? 0;
      break;
    }
  }
  return effectiveLevel < reentryUntilLevel.value;
});

const canReentry = (player) => {
  if (!player.eliminated || player.placement === 1) return false;
  // If session not loaded yet, block re-entry by default
  if (!tournamentConfig.value || !reentryUntilLevel.value) return false;

  // Check per-player total buy-in count limit (maxReentries = total buy-in times including initial)
  if (maxReentries.value > 0) {
    const count = getPlayerReentryCount(player);
    if (count + 1 >= maxReentries.value) return false;
  }

  // Check level limit — during breaks, look at the nearest preceding play level
  const levels = tournamentConfig.value?.levels || [];
  const idx = clockLevelIndex.value ?? 0;
  let effectiveLevel = 0;
  for (let i = idx; i >= 0; i--) {
    if (!levels[i]?.isBreak) {
      effectiveLevel = levels[i]?.level ?? 0;
      break;
    }
  }
  return effectiveLevel < reentryUntilLevel.value;
};

// A player is champion if: placement=1 already set (post-settlement),
// OR they are the last standing player and reentries are no longer open.
const isChampion = (player) => {
  if (player.placement === 1) return true;
  return !player.eliminated && activePlayers.value.length === 1 && !reentriesOpen.value;
};

const playersStillInPlay = computed(() =>
  activePlayers.value.filter(player => !isChampion(player))
);

const isParticipant = computed(() =>
  (game.value?.players || []).some(player => player.uid === user.value?.uid)
);


const payoutDetails = computed(() => {
  const prizeMap = buildTournamentPrizeMap(prizePool.value, payoutRatios.value);
  const players = game.value?.players || [];
  return payoutRatios.value.map(r => {
    const prize = prizeMap[r.place] || 0;
    const winner = players.find(p => p.placement === r.place);
    return { place: r.place, prize, playerName: winner?.name || null };
  });
});

// ── Deal settlement (協議結算) ──

// A deal is possible when everyone left is already in the money (alive count
// ≤ paid places) and re-entry is closed — the pool can no longer change.
const canDeal = computed(() =>
  isHost.value &&
  activePlayers.value.length >= 2 &&
  payoutRatios.value.length > 0 &&
  activePlayers.value.length <= payoutRatios.value.length &&
  !reentriesOpen.value
);

// The undecided prizes (places 1..aliveCount); eliminated ITM places stay fixed
const dealPrizes = computed(() => {
  const prizeMap = buildTournamentPrizeMap(prizePool.value, payoutRatios.value);
  return activePlayers.value.map((_, i) => ({ place: i + 1, prize: prizeMap[i + 1] || 0 }));
});

// Total chips in play = total entries ever made × starting stack — used to
// sanity-check the host's chip-count inputs (0 = config unknown, check skipped).
// Entries are derived from the WHOLE prize pool (every buy-in + re-entry across
// all players, eliminated included) ÷ base buy-in, so re-entries are counted.
const expectedChips = computed(() => {
  const startingChips = tournamentConfig.value?.startingChips || 0;
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  if (!startingChips || baseBuyIn <= 0) return 0;
  const totalBuyIns = (game.value?.players || []).reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const totalEntries = Math.round(totalBuyIns / baseBuyIn);
  return totalEntries * startingChips;
});

const openDeal = () => {
  showSettlement.value = false;
  showDeal.value = true;
};

const settlementPlayers = computed(() => {
  if (!game.value) return [];
  // Same rounding as the settlement function (largest remainder)
  const prizeMap = buildTournamentPrizeMap(prizePool.value, payoutRatios.value);

  return [...game.value.players]
    .sort((a, b) => (a.placement || 999) - (b.placement || 999))
    .map(p => {
      const prize = prizeMap[p.placement] || 0;
      // KO: heads collected + own head if still alive (the champion keeps it)
      const bounty = finalBounty(p, bountyPerHead.value);
      return {
        ...p,
        prize,
        bounty,
        netProfit: prize + bounty - (p.buyIn || 0),
      };
    });
});

const settlementTotals = computed(() => settlementPlayers.value.reduce((acc, p) => ({
  buyIn: acc.buyIn + (p.buyIn || 0),
  bounty: acc.bounty + (p.bounty || 0),
  profit: acc.profit + (p.netProfit || 0),
}), { buyIn: 0, bounty: 0, profit: 0 }));

// ── Auto-join (deep link) ──

onMounted(async () => {
  const targetGameId = route.params.gameId;
  if (targetGameId) {
    if (game.value?.id === targetGameId) {
      // already loaded
    } else {
      autoJoinLoading.value = true;
      try {
        const result = await checkGameStatus(targetGameId);
        if (result.status === 'joined') {
          await joinGameListener(targetGameId);
        } else if (result.status === 'open') {
          // Not yet in game — auto-join as a new player (e.g. via LINE share link).
          const baseBuyIn = result.baseBuyIn || DEFAULT_BUY_IN;
          await joinAsNewPlayer(targetGameId, baseBuyIn);
        } else {
          router.push('/lobby');
        }
      } catch {
        router.push('/lobby');
      } finally {
        autoJoinLoading.value = false;
      }
    }
  }
});

// Watch for tournament session ID — fires immediately so that if game is already in store
// the session is joined synchronously on mount; also handles async game load.
watch(() => game.value?.tournamentSessionId, (sid) => {
  if (sid && !tournamentSession.value) {
    joinTournamentSession(sid);
  }
}, { immediate: true });

// Listen to hand records
watch(() => gameId.value, (newGameId) => {
  if (newGameId) {
    listenToHandRecords(newGameId);
  } else {
    cleanupHands();
  }
}, { immediate: true });

// ── Handlers ──

// ── KO: pick the eliminator(s) ──
const showKnockout = ref(false);
const knockoutTarget = ref(null);
// Players still in, the most recent eliminators first
const knockoutCandidates = computed(() => {
  const recent = [];
  for (const tx of eliminationRecords.value) {
    for (const a of tx.restore?.bounty?.awards || []) {
      if (!recent.includes(a.playerId)) recent.push(a.playerId);
    }
  }
  const rank = (p) => (recent.includes(p.id) ? recent.indexOf(p.id) : recent.length);
  return activePlayers.value
    .filter((p) => p.id !== knockoutTarget.value?.id)
    .sort((a, b) => rank(a) - rank(b));
});
const knockoutWarning = computed(() =>
  (activePlayers.value.length <= 2 && !reentriesOpen.value) ? t('tournament.lastTwoWarning') : ''
);

const runElimination = (player, eliminatorIds = []) => withLoading(async () => {
  const ok = await eliminatePlayer(player.id, { eliminatorIds });
  if (!ok) {
    showError(gameError.value || 'Failed to eliminate player');
    return;
  }
  success(t('tournament.eliminated'));
}, t('loading.saving'));

const handleKnockoutConfirm = (eliminatorIds) => {
  if (knockoutTarget.value) runElimination(knockoutTarget.value, eliminatorIds);
};

const handleEliminate = async (player) => {
  if (isChampion(player)) return;

  // KO games ask who knocked them out (the modal is the confirmation)
  if (bountyPerHead.value > 0) {
    knockoutTarget.value = player;
    showKnockout.value = true;
    return;
  }

  const alive = activePlayers.value.length;
  const isFinalElimination = alive <= 2 && !reentriesOpen.value;
  const message = isFinalElimination
    ? t('tournament.lastTwoWarning')
    : t('tournament.confirmEliminate', { name: player.name });

  const shouldEliminate = await confirm({ message, type: isFinalElimination ? 'warning' : 'danger' });
  if (shouldEliminate) {
    await withLoading(async () => {
      const ok = await eliminatePlayer(player.id);
      if (!ok) {
        showError(gameError.value || 'Failed to eliminate player');
        return;
      }

      success(t('tournament.eliminated'));
    }, t('loading.saving'));
  }
};

const handleReentry = async (player) => {
  const shouldReentry = await confirm({
    message: t('tournament.confirmReentry', { name: player.name }),
    type: 'info',
  });
  if (shouldReentry) {
    await withLoading(async () => {
      const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
      const ok = await reentryPlayer(player.id);
      if (!ok) {
        showError(gameError.value || 'Failed to re-entry player');
        return;
      }
      // reentryPlayer updated buyIn and wrote the 'reentry' log record atomically
      success(t('tournament.reentryAction'));
      // Send LINE buy-in notification for re-entry
      const newTotalBuyIn = (player.buyIn || 0) + baseBuyIn;
      sendBuyInMessage(displayName.value, player.name, baseBuyIn, game.value?.name, game.value?.id, {
        totalBuyIn: newTotalBuyIn,
        baseBuyIn,
        gameType: 'tournament',
      });
    }, t('loading.saving'));
  }
};

const handleEditPlayer = (player) => {
  editingPlayer.value = { ...player };
  showEditPlayer.value = true;
};

const handleSavePlayer = async () => {
  await withLoading(async () => {
    // Only the name is editable here; never send buyIn from the stale form copy.
    await updatePlayer({ id: editingPlayer.value.id, name: editingPlayer.value.name });
    showEditPlayer.value = false;
    editingPlayer.value = null;
  }, t('loading.saving'));
};

// Row ⋯ → 移除玩家 (someone who joined the wrong room)
const handleRemoveFromRow = async (player) => {
  const shouldRemove = await confirm({ message: t('game.confirmRemove'), type: 'danger' });
  if (!shouldRemove) return;
  await withLoading(() => removePlayer(player), t('loading.removing'));
};

const handleRemovePlayer = async () => {
  const shouldRemove = await confirm({ message: t('game.confirmRemove'), type: 'danger' });
  if (shouldRemove) {
    await withLoading(async () => {
      await removePlayer(editingPlayer.value);
      showEditPlayer.value = false;
      editingPlayer.value = null;
    }, t('loading.removing'));
  }
};

const handleAddPlayer = async () => {
  await withLoading(async () => {
    const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
    const playerName = newPlayerName.value || 'Player';
    const newPlayer = await addPlayer(playerName, 0);
    if (newPlayer) {
      // Record transaction so it appears in the transaction log
      await recordBuyIn(newPlayer.id, null, playerName, baseBuyIn, 'buy_in');
      // Send LINE buy-in notification for new player
      sendBuyInMessage(displayName.value, playerName, baseBuyIn, game.value?.name, game.value?.id, {
        totalBuyIn: baseBuyIn,
        baseBuyIn,
        gameType: 'tournament',
      });
      showAddPlayer.value = false;
      newPlayerName.value = '';
    }
  }, t('loading.saving'));
};

const handleCopyId = async () => {
  await copyWithNotification(game.value.id, t('game.copyId'));
};

const handleShareToLine = async () => {
  const shared = await shareGameInvite(
    game.value.name,
    game.value.id,
    game.value.hostName || displayName.value,
    true,
  );
  if (shared) {
    success(t('game.shareSuccess'));
  }
};

const findTxPlayer = (tx) => game.value?.players?.find(
  p => tx.targetId ? p.id === tx.targetId : (tx.targetUid ? p.uid === tx.targetUid : p.name === tx.targetName)
);

const notifyUndo = (tx) => {
  const baseBuyIn = game.value?.baseBuyIn || DEFAULT_BUY_IN;
  const newTotal = findTxPlayer(tx)?.buyIn || 0;
  sendUndoMessage(displayName.value, tx.targetName, Math.abs(tx.amount), game.value?.name, game.value?.id, {
    totalBuyIn: newTotal,
    baseBuyIn,
    gameType: 'tournament',
  });
};

/**
 * "淘汰復原": revert an elimination from the log. State (eliminated / placement /
 * playersRemaining / auto-crowned champion) is restored atomically by the store.
 */
const handleRestoreElimination = async (tx) => {
  const shouldRestore = await confirm({
    message: t('transaction.confirmRestoreElimination', { name: tx.targetName }),
    type: 'warning',
  });
  if (!shouldRestore) return;

  await withLoading(async () => {
    const ok = await undoEliminationTx(tx.txId);
    if (!ok) {
      showError(gameError.value || 'Failed to restore player');
      return;
    }
    success(t('transaction.restoreSuccess'));
  }, t('loading.saving'));
};

/**
 * Undo a re-entry from the log: refunds the buy-in AND puts the player back
 * into the eliminated state they had before re-entering.
 */
const handleUndoReentry = async (tx) => {
  const shouldUndo = await confirm({
    message: t('transaction.confirmUndoReentry', { name: tx.targetName }),
    type: 'warning',
  });
  if (!shouldUndo) return;

  await withLoading(async () => {
    const result = await undoReentryTx(tx.txId);
    if (!result) {
      showError(gameError.value || 'Failed to undo re-entry');
      return;
    }
    success(t('transaction.undoSuccess'));
    notifyUndo(tx);
  }, t('loading.saving'));
};

const handleUndoBuyIn = async (tx) => {
  // Status-changing records have their own atomic undo paths.
  if (tx.type === 'eliminate') return handleRestoreElimination(tx);
  if (tx.type === 'reentry') return handleUndoReentry(tx);

  const shouldUndo = await confirm({ message: t('transaction.confirmUndo'), type: 'warning' });
  if (shouldUndo) {
    await withLoading(async () => {
      const result = await undoBuyIn(tx.txId);

      if (result) {
        // undoBuyIn already moved the seat's buyIn back (same transaction);
        // re-entry records are undone by handleUndoReentry above.

        success(t('transaction.undoSuccess'));
      }

      notifyUndo(tx);
    }, t('loading.saving'));
  }
};

const handleSelectHand = (hand) => {
  selectedHand.value = hand;
  showHandDetail.value = true;
};

const handleHandRecordSaved = () => {
  showHandRecord.value = false;
};

// Shared post-settlement flow (normal settle + deal settle): close modals,
// wait for the history projection, send the LINE summary, then leave the room.
const finalizeSettlement = async (settleResult) => {
  const gameName = game.value?.name;
  const gId = game.value?.id;
  showSettlement.value = false;
  showDeal.value = false;
  isSyncingHistory.value = true;
  syncStatusMessage.value = t('loading.syncingHistory');
  const syncResult = await userStore.waitForHistorySync(settleResult.gameId, settleResult.syncToken, {
    timeoutMs: 20000,
    fallbackToGameProjection: true,
  });
  isSyncingHistory.value = false;
  if (syncResult.source === 'timeout') {
    warning(t('loading.syncingPending'));
  }
  sendTournamentSettlementMessage({
    gameName,
    gameId: gId,
    players: settleResult.settlement,
  });
  const back = consumeSessionReturn(gId);
  clearCurrentGame();
  router.push(back || '/report');
};

const handleSettle = async () => {
  // Guard: payoutRatios are loaded from the tournament session asynchronously.
  // If the session hasn't loaded yet, payoutRatios would be empty and write
  // payoutRatios:[] to Firestore, causing the history projection Cloud Function to fail.
  if (payoutRatios.value.length === 0) {
    showError(t('tournament.payoutRatiosNotLoaded'));
    return;
  }

  const shouldSettle = await confirm({
    message: t('tournament.confirmSettle'),
    type: 'warning',
  });
  if (shouldSettle) {
    await withLoading(async () => {
      const settleResult = await settleTournament();
      if (settleResult?.success) {
        await finalizeSettlement(settleResult);
      } else {
        showError(t(gameError.value || 'tournament.settlementFailed'));
      }
    }, t('loading.settling'));
  }
};

const handleDealConfirm = async (deal) => {
  const shouldSettle = await confirm({
    message: t('tournament.dealConfirmMessage'),
    type: 'warning',
  });
  if (!shouldSettle) return;

  await withLoading(async () => {
    const settleResult = await settleTournamentWithDeal(deal);
    if (settleResult?.success) {
      await finalizeSettlement(settleResult);
      return;
    }
    // Someone was eliminated / re-entered while negotiating → numbers are stale
    if (gameError.value === 'DEAL_STATE_CHANGED') {
      showDeal.value = false;
      showError(t('tournament.dealStateChanged'));
    } else if (gameError.value === 'DEAL_TOTAL_MISMATCH') {
      showError(t('tournament.dealMismatch'));
    } else {
      showError(t(gameError.value || 'tournament.settlementFailed'));
    }
  }, t('loading.settling'));
};

const handleCloseGame = async () => {
  const shouldClose = await confirm({ message: t('game.confirmClose'), type: 'danger' });
  if (shouldClose) {
    await withLoading(async () => {
      const gId = game.value?.id;
      const ok = await closeGame();
      if (ok) {
        const back = consumeSessionReturn(gId);
        router.push(back || '/lobby');
      }
    }, t('loading.closing'));
  }
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
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
  color: rgb(var(--tw-slate-200));
  background: rgb(var(--tw-slate-700) / 0.45);
}
.settle-grid {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 4.6rem 5.2rem;
  gap: 0.35rem;
  padding: 0.45rem 0;
  font-size: 0.82rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700));
}
.settle-grid.ko { grid-template-columns: 2rem minmax(0, 1fr) 4.4rem 3.8rem 4.8rem; }
.settle-head { font-size: 0.7rem; color: rgb(var(--tw-slate-400)); }
</style>
