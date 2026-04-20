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
  <div v-else class="pt-16 px-4 pb-24">
    <!-- Fixed header -->
    <div class="fixed top-0 inset-x-0 z-30 bg-slate-800/90 backdrop-blur px-4 py-3 border-b border-slate-700 flex justify-between items-center max-w-md mx-auto">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-white font-bold">{{ game.name }}</span>
          <span class="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-semibold">🏆</span>
        </div>
        <div class="text-[10px] text-gray-400">{{ $t('game.host') }}: {{ game.hostName || $t('common.unknown') }}</div>
      </div>
      <div class="text-right">
        <div class="text-[10px] text-gray-400">{{ $t('tournament.prizePool') }}</div>
        <div class="font-mono text-amber-400 font-bold">${{ formatNumber(prizePool) }}</div>
      </div>
    </div>

    <!-- Player cards -->
    <div class="space-y-3 mt-2">
      <!-- Active players first, then eliminated (sorted by placement desc) -->
      <TournamentPlayerCard
        v-for="player in sortedPlayers"
        :key="player.id"
        :player="player"
        :is-host="isHost"
        :can-reentry="canReentry(player)"
        :base-buy-in="game?.baseBuyIn || 0"
        @eliminate="handleEliminate"
        @reentry="handleReentry"
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
      <BaseButton
        v-if="game.tournamentSessionId"
        @click="$router.push(`/tournament-clock/${game.tournamentSessionId}`)"
        variant="ghost"
        size="sm"
      >
        <i class="fas fa-trophy mr-1 text-amber-400"></i>{{ $t('tournament.viewClock') }}
      </BaseButton>
      <BaseButton @click="showSettlement = true" variant="secondary">
        {{ $t('tournament.settleTournament') }}
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

    <!-- Add player button (host only) -->
    <button
      v-if="isHost"
      @click="showAddPlayer = true"
      class="fixed bottom-24 right-4 w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-xl shadow-lg hover:bg-amber-600 transition active:scale-95"
    >
      <i class="fas fa-plus"></i>
    </button>

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
        <span class="text-gray-400 text-sm">{{ $t('tournament.prizePool') }}</span>
        <span class="text-amber-400 font-bold font-mono">${{ formatNumber(prizePool) }}</span>
      </div>

      <!-- Payout table -->
      <div v-if="payoutRatios.length > 0" class="mb-4">
        <div class="text-xs text-gray-400 mb-2">{{ $t('tournament.payouts') }}</div>
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

      <!-- Player results -->
      <div class="space-y-2 mb-4 max-h-60 overflow-y-auto">
        <div class="text-xs text-gray-400 mb-1">{{ $t('tournament.placement') }}</div>
        <div
          v-for="p in settlementPlayers"
          :key="p.id"
          class="flex justify-between text-sm py-1 border-b border-slate-700"
        >
          <div class="flex items-center gap-2">
            <span v-if="p.placement" class="text-gray-300 font-mono w-6">#{{ p.placement }}</span>
            <span v-else class="text-gray-500 w-6 text-center">—</span>
            <span class="text-white">{{ p.name }}</span>
          </div>
          <div class="text-right">
            <div :class="p.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'" class="font-mono">
              {{ p.netProfit > 0 ? '+' : '' }}${{ formatNumber(p.netProfit) }}
            </div>
            <div class="text-[10px] text-gray-500">
              {{ $t('tournament.totalBuyIn') }}: ${{ formatNumber(p.buyIn) }} |
              {{ $t('tournament.prize') }}: ${{ formatNumber(p.prize) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Warnings -->
      <div v-if="activePlayers.length > 0" class="text-amber-400 text-center text-xs mb-4">
        <i class="fas fa-exclamation-triangle mr-1"></i>
        {{ activePlayers.length }} {{ $t('tournament.inPlay') }}
      </div>

      <div class="grid gap-3">
        <BaseButton @click="handleSettle" variant="primary" fullWidth :disabled="activePlayers.length > 1">
          {{ $t('common.confirm') }}
        </BaseButton>
      </div>
    </BaseModal>

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
import { useAuth } from '../composables/useAuth.js';
import { useGame } from '../composables/useGame.js';
import { useHand } from '../composables/useHand.js';
import { useTransactions } from '../composables/useTransactions.js';
import { useLiff } from '../composables/useLiff.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLoading } from '../composables/useLoading.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import TournamentPlayerCard from '../components/game/TournamentPlayerCard.vue';
import TransactionLog from '../components/game/TransactionLog.vue';
import HandRecordSheet from '../components/game/HandRecordSheet.vue';
import HandHistoryList from '../components/game/HandHistoryList.vue';
import HandHistoryDetail from '../components/game/HandHistoryDetail.vue';
import { formatNumber } from '../utils/formatters.js';
import { DEFAULT_BUY_IN } from '../utils/constants.js';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { user, displayName } = useAuth();
const {
  game, gameId, isHost, addPlayer, updatePlayer, removePlayer,
  checkGameStatus, joinAsNewPlayer, joinGameListener,
  closeGame, eliminatePlayer, reentryPlayer, settleTournament,
} = useGame();
const { sendBuyInMessage, sendUndoMessage, shareGameInvite, isInitialized: liffReady } = useLiff();
const { success, copyWithNotification } = useNotification();
const { confirm } = useConfirm();
const { withLoading } = useLoading();

const { hands, listenToHandRecords, cleanup: cleanupHands } = useHand();
const { transactions, txLoading, txError, recordAction, undoBuyIn } = useTransactions(gameId);

// Tournament session data (for reentryUntilLevel, payoutRatios)
const {
  session: tournamentSession,
  joinSession: joinTournamentSession,
  config: tournamentConfig,
  currentLevelIndex: clockLevelIndex,
} = useTournamentClock();

const showAddPlayer = ref(false);
const showEditPlayer = ref(false);
const showSettlement = ref(false);
const showHandRecord = ref(false);
const showHandDetail = ref(false);
const newPlayerName = ref('');
const editingPlayer = ref(null);
const selectedHand = ref(null);
const autoJoinLoading = ref(false);

// ── Computed ──

const activePlayers = computed(() =>
  (game.value?.players || []).filter(p => !p.eliminated)
);

const prizePool = computed(() =>
  (game.value?.players || []).reduce((sum, p) => sum + (p.buyIn || 0), 0)
);

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

const canReentry = (player) => {
  if (!player.eliminated || player.placement === 1) return false;
  // If session not loaded yet, block re-entry by default
  if (!tournamentConfig.value || !reentryUntilLevel.value) return false;

  // Check per-player re-entry count limit
  if (maxReentries.value > 0) {
    const count = getPlayerReentryCount(player);
    if (count >= maxReentries.value) return false;
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

const sortedPlayers = computed(() => {
  if (!game.value) return [];
  const players = [...game.value.players];
  // Active first, then eliminated sorted by placement (ascending = best first)
  return players.sort((a, b) => {
    if (!a.eliminated && !b.eliminated) return 0;
    if (!a.eliminated) return -1;
    if (!b.eliminated) return 1;
    return (a.placement || 999) - (b.placement || 999);
  });
});

const payoutDetails = computed(() => {
  const pool = prizePool.value;
  const players = game.value?.players || [];
  return payoutRatios.value.map(r => {
    const prize = Math.round(pool * r.percentage / 100);
    const winner = players.find(p => p.placement === r.place);
    return { place: r.place, prize, playerName: winner?.name || null };
  });
});

const settlementPlayers = computed(() => {
  if (!game.value) return [];
  const pool = prizePool.value;
  const prizeMap = {};
  for (const r of payoutRatios.value) {
    prizeMap[r.place] = Math.round(pool * r.percentage / 100);
  }

  return [...game.value.players]
    .sort((a, b) => (a.placement || 999) - (b.placement || 999))
    .map(p => {
      const prize = prizeMap[p.placement] || 0;
      return {
        ...p,
        prize,
        netProfit: prize - (p.buyIn || 0),
      };
    });
});

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
          await joinAsNewPlayer(targetGameId, result.baseBuyIn || DEFAULT_BUY_IN);
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

  // Listen to tournament session for reentryUntilLevel / payoutRatios
  const sid = game.value?.tournamentSessionId;
  if (sid) {
    joinTournamentSession(sid);
  }
});

// Watch for game data becoming available (onSnapshot fires async)
watch(() => game.value?.tournamentSessionId, (sid) => {
  if (sid && !tournamentConfig.value) {
    joinTournamentSession(sid);
  }
});

// Listen to hand records
watch(() => gameId.value, (newGameId) => {
  if (newGameId) {
    listenToHandRecords(newGameId);
  } else {
    cleanupHands();
  }
}, { immediate: true });

// ── Handlers ──

const handleEliminate = async (player) => {
  const alive = activePlayers.value.length;
  const message = alive <= 2
    ? t('tournament.lastTwoWarning')
    : t('tournament.confirmEliminate', { name: player.name });

  const shouldEliminate = await confirm({ message, type: alive <= 2 ? 'warning' : 'danger' });
  if (shouldEliminate) {
    await withLoading(async () => {
      const ok = await eliminatePlayer(player.id);
      if (ok) {
        // Also update tournament session playersRemaining
        const sessionId = game.value?.tournamentSessionId;
        if (sessionId) {
          const { doc, updateDoc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../firebase-init.js');
          const sessionRef = doc(db, 'tournamentSessions', sessionId);
          const snap = await getDoc(sessionRef);
          if (snap.exists()) {
            const st = snap.data().state || {};
            await updateDoc(sessionRef, {
              'state.playersRemaining': Math.max(0, (st.playersRemaining || 0) - 1),
            });
          }
        }
        success(t('tournament.eliminated'));
      }
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
      await reentryPlayer(player.id);
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
    await updatePlayer(editingPlayer.value);
    showEditPlayer.value = false;
    editingPlayer.value = null;
  }, t('loading.saving'));
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
    await addPlayer(playerName, baseBuyIn);
    // Send LINE buy-in notification for new player
    sendBuyInMessage(displayName.value, playerName, baseBuyIn, game.value?.name, game.value?.id, {
      totalBuyIn: baseBuyIn,
      baseBuyIn,
      gameType: 'tournament',
    });
    showAddPlayer.value = false;
    newPlayerName.value = '';
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
  );
  if (shared) {
    success(t('game.shareSuccess'));
  }
};

const handleUndoBuyIn = async (tx) => {
  const shouldUndo = await confirm({ message: t('transaction.confirmUndo'), type: 'warning' });
  if (shouldUndo) {
    await withLoading(async () => {
      await undoBuyIn(tx.txId);
      sendUndoMessage(displayName.value, tx.playerName, tx.amount, game.value?.name, game.value?.id);
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

const handleSettle = async () => {
  const shouldSettle = await confirm({
    message: t('tournament.confirmSettle'),
    type: 'warning',
  });
  if (shouldSettle) {
    await withLoading(async () => {
      const ok = await settleTournament(payoutRatios.value);
      if (ok) {
        showSettlement.value = false;
        router.push('/report');
      }
    }, t('loading.settling'));
  }
};

const handleCloseGame = async () => {
  const shouldClose = await confirm({ message: t('game.confirmClose'), type: 'danger' });
  if (shouldClose) {
    await withLoading(async () => {
      const ok = await closeGame();
      if (ok) {
        router.push('/lobby');
      }
    }, t('loading.closing'));
  }
};
</script>
