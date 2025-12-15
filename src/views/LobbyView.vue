<template>
  <div class="pt-8 px-4 pb-24">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('lobby.title') }}</h2>
    
    <!-- Stats Card -->
    <BaseCard variant="gradient" padding="lg" class="mb-6">
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="text-xs text-gray-400">{{ $t('lobby.stats.totalProfit') }}</div>
          <div
            class="text-3xl font-mono font-bold"
            :class="stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
          >
            {{ formatNumber(stats.totalProfit) }}
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400">{{ $t('lobby.stats.games') }}</div>
          <div class="font-bold text-white text-xl">{{ stats.games }}</div>
        </div>
      </div>
      <div class="flex text-xs text-gray-500 justify-between">
        <span>{{ $t('lobby.stats.winRate') }} {{ stats.winRate }}%</span>
        <span v-if="isGuest" class="text-amber-500">{{ $t('auth.guest') }}</span>
      </div>
    </BaseCard>

    <!-- Pending Invitations -->
    <div v-if="pendingInvitations.length > 0" class="mb-6">
      <h3 class="text-lg font-bold text-white mb-3">{{ $t('invitations.pending') }}</h3>
      <div class="space-y-2">
        <BaseCard
          v-for="inv in pendingInvitations"
          :key="inv.id"
          padding="md"
          class="border-l-4 border-amber-500"
        >
          <div class="flex justify-between items-center">
            <div>
              <div class="text-white font-bold">{{ inv.gameName }}</div>
              <div class="text-xs text-gray-400">
                {{ $t('invitations.from') }}: {{ inv.fromName }}
              </div>
              <div class="text-xs text-gray-500">
                {{ $t('lobby.roomCode') }}: {{ inv.roomCode }}
              </div>
            </div>
            <div class="flex gap-2">
              <BaseButton @click="handleAcceptInvitation(inv)" size="sm" variant="primary">
                {{ $t('invitations.accept') }}
              </BaseButton>
              <BaseButton @click="handleRejectInvitation(inv)" size="sm" variant="danger">
                {{ $t('invitations.reject') }}
              </BaseButton>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- My Rooms -->
    <div v-if="myRooms.length > 0" class="mb-6">
      <h3 class="text-lg font-bold text-white mb-3">{{ $t('lobby.myRooms') }}</h3>
      <div class="space-y-2">
        <BaseCard
          v-for="room in myRooms"
          :key="room.id"
          padding="md"
          clickable
          @click="handleEnterRoom(room.id)"
        >
          <div class="flex justify-between items-center">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-white font-bold">{{ room.name }}</span>
                <span
                  v-if="room.hostUid === user?.uid"
                  class="text-xs bg-amber-600 text-white px-2 py-0.5 rounded"
                >
                  {{ $t('game.host') }}
                </span>
              </div>
              <div class="text-xs text-gray-400">
                {{ $t('lobby.roomCode') }}: {{ room.roomCode }} · 
                {{ $t('lobby.players') }}: {{ room.players?.length || 0 }}
              </div>
              <div class="text-xs text-gray-500">
                {{ formatDate(room.createdAt) }}
              </div>
            </div>
            <div class="text-emerald-400">
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid gap-4">
      <BaseCard padding="md" clickable @click="showCreateModal = true">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl">
            <i class="fas fa-plus"></i>
          </div>
          <div>
            <h3 class="text-white font-bold">{{ $t('lobby.createGame') }}</h3>
          </div>
        </div>
      </BaseCard>

      <BaseCard padding="md" clickable @click="showJoinModal = true">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xl">
            <i class="fas fa-sign-in-alt"></i>
          </div>
          <div>
            <h3 class="text-white font-bold">{{ $t('lobby.joinGame') }}</h3>
          </div>
        </div>
      </BaseCard>
    </div>

    <!-- Create Game Modal -->
    <BaseModal v-model="showCreateModal" :title="$t('lobby.createGame')">
      <BaseInput
        v-model="gameName"
        :placeholder="$t('game.playerName')"
        class="mb-4"
      />
      <div class="flex gap-2 mb-4">
        <BaseInput
          v-model.number="createBuyIn"
          type="number"
          class="flex-1"
        />
        <span class="text-white text-sm pt-3">{{ $t('game.chips') }}</span>
      </div>
      <BaseButton @click="handleCreateGame" variant="primary" fullWidth>
        {{ $t('common.confirm') }}
      </BaseButton>
    </BaseModal>

    <!-- Join Game Modal -->
    <BaseModal v-model="showJoinModal" :title="$t('lobby.joinGame')">
      <div v-if="joinStep === 1">
        <BaseInput
          v-model="gameCode"
          :placeholder="$t('game.enterGameId')"
          class="mb-4"
        />
        <BaseButton @click="handleCheckGame" variant="primary" fullWidth>
          {{ $t('common.next') }}
        </BaseButton>
      </div>
      <div v-else>
        <div v-if="unboundPlayers.length > 0" class="mb-4">
          <p class="text-xs text-gray-400 mb-2">{{ $t('game.emptySeats') }}:</p>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            <button
              v-for="p in unboundPlayers"
              :key="p.id"
              @click="handleBindJoin(p)"
              class="w-full py-2 bg-slate-700 text-white rounded-lg text-sm border border-slate-600 flex justify-between px-3 hover:bg-slate-600"
            >
              <span>{{ p.name }}</span>
              <span class="text-emerald-400">{{ formatNumber(p.buyIn) }}</span>
            </button>
          </div>
          <div class="relative py-3">
            <span class="bg-slate-800 px-2 text-gray-500 text-xs">{{ $t('common.or') }}</span>
          </div>
        </div>
        
        <p class="text-xs text-gray-400 mb-2">{{ $t('game.newSeat') }}:</p>
        <div class="flex gap-2 mb-4">
          <BaseInput
            v-model.number="buyIn"
            type="number"
            class="flex-1"
          />
          <span class="text-white text-sm pt-3">{{ $t('game.chips') }}</span>
        </div>
        <BaseButton @click="handleNewJoin" variant="primary" fullWidth>
          {{ $t('game.buyIn') }}
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useGame } from '../composables/useGame.js';
import { useInvitation } from '../composables/useInvitation.js';
import { usePushNotification } from '../composables/usePushNotification.js';
import { useLoading } from '../composables/useLoading.js';
import { useGameStore } from '../store/modules/game.js';
import { useUserStore } from '../store/modules/user.js';
import { useNotification } from '../composables/useNotification.js';
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import { formatNumber, formatShortDate } from '../utils/formatters.js';
import { DEFAULT_BUY_IN } from '../utils/constants.js';

const { t } = useI18n();
const router = useRouter();
const { isGuest, user } = useAuth();
const { createGame, checkGameStatus, joinByBinding, joinAsNewPlayer, joinGameListener } = useGame();
const gameStore = useGameStore();
const userStore = useUserStore();
const { success, error: showError } = useNotification();
const { sendInvitationNotification } = usePushNotification();
const { withLoading } = useLoading();

// Invitation composable
const {
  pendingInvitations,
  loadInvitations,
  acceptInvitation,
  rejectInvitation,
  cleanup: cleanupInvitations
} = useInvitation();

const stats = computed(() => userStore.stats);
const myRooms = computed(() => gameStore.myRooms);

const showCreateModal = ref(false);
const showJoinModal = ref(false);
const joinStep = ref(1);
const gameName = ref('Poker Game');
const gameCode = ref('');
const buyIn = ref(DEFAULT_BUY_IN);
const createBuyIn = ref(DEFAULT_BUY_IN);
const unboundPlayers = ref([]);

// Track previously seen invitations to show notifications for new ones
const seenInvitationIds = ref(new Set());

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return formatShortDate(date);
};

const handleCreateGame = async () => {
  await withLoading(async () => {
    const gameId = await createGame(gameName.value, createBuyIn.value);
    if (gameId) {
      showCreateModal.value = false;
      success('Game created!');
      // Reload rooms
      await gameStore.loadMyRooms();
      router.push('/game');
    }
  }, t('loading.creating'));
};

const handleCheckGame = async () => {
  if (!gameCode.value) {
    showError('Please enter game ID');
    return;
  }
  
  await withLoading(async () => {
    const result = await checkGameStatus(gameCode.value);
    
    if (result.status === 'joined') {
      await joinGameListener(gameCode.value);
      showJoinModal.value = false;
      success('Already in game');
      router.push('/game');
    } else if (result.status === 'open') {
      unboundPlayers.value = result.unboundPlayers;
      joinStep.value = 2;
    } else {
      showError(result.msg || 'Cannot join game');
    }
  }, t('loading.checking'));
};

const handleBindJoin = async (player) => {
  await withLoading(async () => {
    const success = await joinByBinding(gameCode.value, player.id);
    if (success) {
      showJoinModal.value = false;
      joinStep.value = 1;
      // Reload rooms
      await gameStore.loadMyRooms();
      router.push('/game');
    }
  }, t('loading.binding'));
};

const handleNewJoin = async () => {
  await withLoading(async () => {
    const success = await joinAsNewPlayer(gameCode.value, buyIn.value);
    if (success) {
      showJoinModal.value = false;
      joinStep.value = 1;
      // Reload rooms
      await gameStore.loadMyRooms();
      router.push('/game');
    }
  }, t('loading.joining'));
};

const handleEnterRoom = async (roomId) => {
  await withLoading(async () => {
    await joinGameListener(roomId);
    router.push('/game');
  }, t('loading.loading'));
};

const handleAcceptInvitation = async (invitation) => {
  await withLoading(async () => {
    const accepted = await acceptInvitation(invitation.id);
    if (accepted) {
      success(t('invitations.accepted'));
      // Join the game
      await joinGameListener(invitation.gameId);
      router.push('/game');
    }
  }, t('loading.accepting'));
};

const handleRejectInvitation = async (invitation) => {
  await withLoading(async () => {
    const rejected = await rejectInvitation(invitation.id);
    if (rejected) {
      success(t('invitations.rejected'));
    }
  }, t('loading.rejecting'));
};

onMounted(async () => {
  // Load rooms first
  await gameStore.loadMyRooms();
  
  // Load invitations and mark existing ones as seen
  loadInvitations();
  
  // Wait a bit for the first snapshot to arrive, then mark all as seen
  setTimeout(() => {
    pendingInvitations.value.forEach(inv => {
      seenInvitationIds.value.add(inv.id);
    });
  }, 1000);
});

// Watch for new invitations and show action notifications
watch(pendingInvitations, (newInvitations, oldInvitations) => {
  newInvitations.forEach(inv => {
    // Only show notification for new invitations not seen before
    if (!seenInvitationIds.value.has(inv.id)) {
      seenInvitationIds.value.add(inv.id);
      
      // Show interactive notification
      sendInvitationNotification(
        inv.fromName,
        inv.gameName,
        () => handleAcceptInvitation(inv), // onConfirm
        () => handleRejectInvitation(inv)  // onDecline
      );
    }
  });
}, { deep: true });

onUnmounted(() => {
  cleanupInvitations();
});
</script>
