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
        <div
          v-for="room in myRooms"
          :key="room.id"
          @click="handleEnterRoom(room.id)"
          :class="getRoomCardClass(room)"
          class="rounded-2xl border transition p-4 cursor-pointer active:scale-95 hover:border-opacity-60"
        >
          <!-- Room Type Badge -->
          <div class="flex items-start gap-3 mb-2">
            <span
              class="px-2 py-0.5 rounded text-xs font-bold"
              :class="room.type === 'tournament'
                ? 'bg-amber-600/50 text-amber-200'
                : room.type === 'online'
                  ? 'bg-purple-600/50 text-purple-200'
                  : 'bg-slate-600/50 text-slate-200'"
            >
              {{ room.type === 'tournament'
                ? '🏆 ' + $t('lobby.tournamentLabel')
                : room.type === 'online'
                  ? '🌐 ' + $t('lobby.onlineLabel')
                  : '🎰 ' + $t('lobby.liveLabel') }}
            </span>
            <span
              v-if="room.hostUid === user?.uid"
              class="px-2 py-0.5 rounded text-xs bg-amber-600 text-white"
            >
              {{ $t('game.host') }}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-bold">{{ room.name }}</span>
              </div>
              
              <!-- Common info -->
              <div class="text-xs text-gray-400 mt-1">
                {{ $t('lobby.roomCode') }}: {{ room.roomCode }}
              </div>

              <!-- Online-specific info -->
              <div v-if="room.type === 'online'" class="text-xs text-gray-400 mt-1 space-y-0.5">
                <div>{{ $t('lobby.blinds') }}: {{ room.blinds?.small || 1 }}/{{ room.blinds?.big || 2 }}</div>
                <div>
                  {{ $t('lobby.currentPlayers') }}: {{ room.players?.length || 0 }} / 
                  {{ $t('lobby.maxPlayers') }}: {{ room.maxPlayers || 10 }}
                </div>
                <div>
                  {{ $t('lobby.roomStatus') }}: 
                  <span :class="getRoomStatusClass(room.status)">
                    {{ getRoomStatusText(room.status) }}
                  </span>
                </div>
              </div>

              <!-- Live-specific info -->
              <div v-else class="text-xs text-gray-400 mt-1">
                {{ $t('lobby.players') }}: {{ room.players?.length || 0 }}
              </div>

              <div class="text-xs text-gray-500 mt-1">
                {{ formatDate(room.createdAt) }}
              </div>
            </div>
            <div class="text-emerald-400 flex items-center gap-2">
                <!-- Edit button for host -->
                <button
                  v-if="room.hostUid === user?.uid"
                  @click.stop="handleEditRoom(room)"
                  class="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-600/10 transition"
                  :title="$t('common.edit')"
                >
                  <i class="fas fa-pencil-alt text-sm"></i>
                </button>
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        </div>
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

    <!-- Tools Section -->
    <div class="mt-6">
      <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('lobby.tools') }}</h3>
      <div class="grid grid-cols-2 gap-3">
        <BaseCard padding="md" clickable @click="$router.push('/tournament-presets')">
          <div class="flex flex-col items-center gap-2 text-center py-1">
            <div class="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
              🏆
            </div>
            <span class="text-white text-sm font-semibold">{{ $t('action.tournamentSetup') }}</span>
          </div>
        </BaseCard>
        <BaseCard padding="md" clickable @click="$router.push('/time-bank/new')">
          <div class="flex flex-col items-center gap-2 text-center py-1">
            <div class="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">
              ⏱
            </div>
            <span class="text-white text-sm font-semibold">{{ $t('action.timeBank') }}</span>
          </div>
        </BaseCard>
        <BaseCard padding="md" clickable @click="$router.push('/admin/tables')">
          <div class="flex flex-col items-center gap-2 text-center py-1">
            <div class="w-10 h-10 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-lg">
              ⚙️
            </div>
            <span class="text-white text-sm font-semibold">{{ $t('admin.management.title') }}</span>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Create Game Modal -->
    <BaseModal v-model="showCreateModal" :title="$t('lobby.createGame')">
      <!-- Step 1: Choose game type -->
      <div v-if="createStep === 1" class="space-y-3">
        <p class="text-sm text-gray-400 mb-2">{{ $t('lobby.chooseGameType') }}</p>
        <div
          @click="selectGameType('cash')"
          class="flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all active:scale-98"
          :class="selectedGameType === 'cash' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
            💵
          </div>
          <div>
            <h4 class="text-white font-bold">{{ $t('lobby.cashGame') }}</h4>
            <p class="text-gray-400 text-xs">{{ $t('lobby.cashGameDesc') }}</p>
          </div>
        </div>
        <div
          @click="selectGameType('tournament')"
          class="flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all active:scale-98"
          :class="selectedGameType === 'tournament' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
            🏆
          </div>
          <div>
            <h4 class="text-white font-bold">{{ $t('lobby.tournamentGame') }}</h4>
            <p class="text-gray-400 text-xs">{{ $t('lobby.tournamentGameDesc') }}</p>
          </div>
        </div>
        <BaseButton @click="createStep = 2" variant="primary" fullWidth :disabled="!selectedGameType">
          {{ $t('common.next') }}
        </BaseButton>
      </div>

      <!-- Step 2 (tournament only): Choose template -->
      <div v-else-if="createStep === 2 && selectedGameType === 'tournament'" class="space-y-3">
        <p class="text-sm text-gray-400 mb-2">{{ $t('lobby.chooseTemplate') }}</p>

        <!-- Custom presets (shown first) -->
        <div
          v-for="tmpl in allTemplateOptions.filter(t => !t.isBuiltIn)"
          :key="tmpl.id"
          @click="selectedTemplate = tmpl"
          class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
          :class="selectedTemplate?.id === tmpl.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
        >
          <div class="flex-1 min-w-0">
            <div class="text-white font-semibold text-sm truncate">
              {{ tmpl.name }}
            </div>
            <div class="text-gray-400 text-xs">
              {{ $t('tournament.buyInAmount') }}: {{ tmpl.buyIn }} ·
              {{ tmpl.levels.filter(l => !l.isBreak).length }} {{ $t('tournament.level') }}
            </div>
          </div>
          <i v-if="selectedTemplate?.id === tmpl.id" class="fas fa-check text-amber-400"></i>
        </div>

        <!-- Built-in templates (collapsible) -->
        <div class="border-t border-slate-700 pt-2">
          <button
            @click="showBuiltInTemplates = !showBuiltInTemplates"
            class="flex items-center justify-between w-full py-2 text-sm text-gray-400 hover:text-white transition"
          >
            <span>{{ $t('tournament.builtInTemplates') }}</span>
            <i class="fas" :class="showBuiltInTemplates ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
          </button>
          <div v-if="showBuiltInTemplates" class="space-y-2">
            <div
              v-for="tmpl in allTemplateOptions.filter(t => t.isBuiltIn)"
              :key="tmpl.id"
              @click="selectedTemplate = tmpl"
              class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
              :class="selectedTemplate?.id === tmpl.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50 hover:bg-slate-600/50'"
            >
              <div class="flex-1 min-w-0">
                <div class="text-white font-semibold text-sm truncate">
                  {{ $t(tmpl.nameKey) }}
                </div>
                <div class="text-gray-400 text-xs">
                  {{ $t('tournament.buyInAmount') }}: {{ tmpl.buyIn }} ·
                  {{ tmpl.levels.filter(l => !l.isBreak).length }} {{ $t('tournament.level') }}
                </div>
              </div>
              <i v-if="selectedTemplate?.id === tmpl.id" class="fas fa-check text-amber-400"></i>
            </div>
          </div>
        </div>

        <div v-if="allTemplateOptions.length === 0" class="text-center text-gray-500 py-4 text-sm">
          {{ $t('tournament.noPresets') }}
        </div>

        <div class="flex gap-2">
          <BaseButton @click="createStep = 1" variant="ghost" class="flex-1">
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton @click="createStep = 3" variant="primary" class="flex-1" :disabled="!selectedTemplate">
            {{ $t('common.next') }}
          </BaseButton>
        </div>
      </div>

      <!-- Step 2 (cash) / Step 3 (tournament): Name + Buy-in -->
      <div v-else>
        <BaseInput
          v-model="gameName"
          :placeholder="$t('game.playerName')"
          class="mb-4"
        />

        <!-- Show selected template summary for tournament -->
        <div v-if="selectedGameType === 'tournament' && selectedTemplate" class="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-amber-400 text-sm font-semibold">
              🏆 {{ selectedTemplate.isBuiltIn ? $t(selectedTemplate.nameKey) : selectedTemplate.name }}
            </span>
            <button @click="createStep = 2" class="text-xs text-gray-400 hover:text-white">
              {{ $t('common.change') }}
            </button>
          </div>
          <div class="text-gray-400 text-xs mt-1">
            {{ $t('tournament.startingChips') }}: {{ formatNumber(selectedTemplate.startingChips) }} ·
            {{ selectedTemplate.levels.filter(l => !l.isBreak).length }} {{ $t('tournament.level') }}
          </div>
        </div>

        <!-- Cash game: chip stepper -->
        <div v-if="selectedGameType !== 'tournament'" class="flex gap-2 mb-4 items-center">
          <BaseButton @click="decrementCreateBuyIn" size="sm">-100</BaseButton>
          <label class="flex-1">
            <BaseInput
              v-model.number="createBuyIn"
              type="number"
              :min="MIN_BUY_IN"
              :step="CHIP_STEP"
              class="w-full"
            />
          </label>
          <BaseButton @click="incrementCreateBuyIn" size="sm">+100</BaseButton>
          <span class="text-white text-sm">{{ $t('game.chips') }}</span>
        </div>
        <!-- Tournament: read-only buy-in display -->
        <div v-else class="mb-4 p-3 bg-slate-700/50 rounded-lg flex justify-between items-center">
          <span class="text-gray-400 text-sm">{{ $t('tournament.buyInAmount') }}</span>
          <span class="text-white font-mono font-bold text-lg">${{ formatNumber(createBuyIn) }}</span>
        </div>

        <div class="flex gap-2">
          <BaseButton @click="createStep = selectedGameType === 'tournament' ? 2 : 1" variant="ghost" class="flex-1">
            {{ $t('common.back') }}
          </BaseButton>
          <BaseButton @click="handleCreateGame" variant="primary" class="flex-1">
            {{ $t('common.confirm') }}
          </BaseButton>
        </div>
      </div>
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
import { DEFAULT_BUY_IN, MIN_BUY_IN, CHIP_STEP, GAME_TYPE } from '../utils/constants.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';

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

// Tournament create flow
const createStep = ref(1);
const selectedGameType = ref(null);
const selectedTemplate = ref(null);
const userPresets = ref([]);

const { createSession: createTournamentSession, listenPresets } = useTournamentClock();

// Merge built-in templates with user presets for the picker
const allTemplateOptions = computed(() => {
  const builtIn = TOURNAMENT_TEMPLATES.map((t) => ({ ...t, isBuiltIn: true }));
  const custom = userPresets.value.map((p) => ({ ...p, isBuiltIn: false }));
  // Custom presets first, then built-in
  return [...custom, ...builtIn];
});

const showBuiltInTemplates = ref(false);

// Load user presets when modal opens
let unsubPresets = null;

const selectGameType = (type) => {
  selectedGameType.value = type;
  if (type === 'cash') {
    createStep.value = 2; // Skip template step, go straight to name+buyin
  }
};

// Reset create modal state when it closes
watch(showCreateModal, (val) => {
  if (!val) {
    createStep.value = 1;
    selectedGameType.value = null;
    selectedTemplate.value = null;
    gameName.value = 'Poker Game';
    createBuyIn.value = DEFAULT_BUY_IN;
    showBuiltInTemplates.value = false;
  } else {
    // Load user presets when modal opens
    if (!unsubPresets) {
      unsubPresets = listenPresets((presets) => {
        userPresets.value = presets;
        // Auto-expand built-in if no custom presets
        if (presets.length === 0) {
          showBuiltInTemplates.value = true;
        }
      });
    }
  }
});

// Auto-fill buy-in from tournament template
watch(selectedTemplate, (tmpl) => {
  if (tmpl && tmpl.buyIn) {
    createBuyIn.value = tmpl.buyIn;
  }
});

// Track previously seen invitations to show notifications for new ones
const seenInvitationIds = ref(new Set());

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return formatShortDate(date);
};

const getRoomCardClass = (room) => {
  if (room.type === 'tournament') {
    return 'bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-700/30';
  }
  if (room.type === 'online') {
    return 'bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-700/30';
  }
  return 'bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/30';
};

const getRoomStatusClass = (status) => {
  if (status === 'waiting') return 'text-yellow-400';
  if (status === 'playing' || status === 'active') return 'text-emerald-400';
  if (status === 'ended' || status === 'completed') return 'text-gray-500';
  return 'text-gray-400';
};

const getRoomStatusText = (status) => {
  if (status === 'waiting') return t('lobby.statusWaiting');
  if (status === 'playing' || status === 'active') return t('lobby.statusPlaying');
  if (status === 'ended' || status === 'completed') return t('lobby.statusEnded');
  return status;
};


const incrementCreateBuyIn = () => {
  createBuyIn.value = (createBuyIn.value || 0) + CHIP_STEP;
};

const decrementCreateBuyIn = () => {
  if (createBuyIn.value > MIN_BUY_IN) {
    createBuyIn.value = Math.max(MIN_BUY_IN, createBuyIn.value - CHIP_STEP);
  }
};

const handleCreateGame = async () => {
  await withLoading(async () => {
    let type = GAME_TYPE.LIVE;
    let options = {};
    let tournamentSessionId = null;

    if (selectedGameType.value === 'tournament' && selectedTemplate.value) {
      type = GAME_TYPE.TOURNAMENT;
      // Auto-create a tournament clock session
      const tmpl = selectedTemplate.value;
      tournamentSessionId = await createTournamentSession({
        name: gameName.value || tmpl.name || 'Tournament',
        subtitle: tmpl.subtitle || '',
        buyIn: createBuyIn.value,
        startingChips: tmpl.startingChips,
        reentryUntilLevel: tmpl.reentryUntilLevel,
        maxReentries: tmpl.maxReentries ?? 0,
        levels: tmpl.levels,
        payoutRatios: tmpl.payoutRatios,
      });
      options.tournamentSessionId = tournamentSessionId;
    }

    const gameId = await createGame(gameName.value, createBuyIn.value, type, options);
    if (gameId) {
      // Link tournament session back to the game room
      if (tournamentSessionId) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase-init.js');
        await updateDoc(doc(db, 'tournamentSessions', tournamentSessionId), { gameId });
      }
      showCreateModal.value = false;
      success(t('lobby.gameCreated'));
      await gameStore.loadMyRooms();
      router.push(type === GAME_TYPE.TOURNAMENT ? '/tournament-game' : '/game');
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
    const bindSuccess = await joinByBinding(gameCode.value, player.id);
    if (bindSuccess) {
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
    const joinSuccess = await joinAsNewPlayer(gameCode.value, buyIn.value);
    if (joinSuccess) {
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
    // Check room type to route to the correct view
    const room = myRooms.value.find(r => r.id === roomId);
    await joinGameListener(roomId);
    router.push(room?.type === 'tournament' ? '/tournament-game' : '/game');
  }, t('loading.loading'));
};

const handleEditRoom = (room) => {
  if (room.type === 'tournament' && room.status === 'completed') {
    router.push(`/admin/cash/${room.id}?src=games`);
  } else if (room.type === 'tournament' && room.tournamentSessionId) {
    router.push(`/admin/tournament/${room.tournamentSessionId}`);
  } else {
    router.push(`/admin/cash/${room.id}`);
  }
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
  if (unsubPresets) {
    unsubPresets();
    unsubPresets = null;
  }
});
</script>
