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
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useGame } from '../composables/useGame.js';
import { useUserStore } from '../store/modules/user.js';
import { useNotification } from '../composables/useNotification.js';
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import { formatNumber } from '../utils/formatters.js';
import { DEFAULT_BUY_IN } from '../utils/constants.js';

const { t } = useI18n();
const router = useRouter();
const { isGuest } = useAuth();
const { createGame, checkGameStatus, joinByBinding, joinAsNewPlayer, joinGameListener } = useGame();
const userStore = useUserStore();
const { success, error: showError } = useNotification();

const stats = computed(() => userStore.stats);

const showCreateModal = ref(false);
const showJoinModal = ref(false);
const joinStep = ref(1);
const gameName = ref('Poker Game');
const gameCode = ref('');
const buyIn = ref(DEFAULT_BUY_IN);
const unboundPlayers = ref([]);

const handleCreateGame = async () => {
  const gameId = await createGame(gameName.value);
  if (gameId) {
    showCreateModal.value = false;
    success('Game created!');
    router.push('/game');
  }
};

const handleCheckGame = async () => {
  if (!gameCode.value) {
    showError('Please enter game ID');
    return;
  }
  
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
};

const handleBindJoin = async (player) => {
  const success = await joinByBinding(gameCode.value, player.id);
  if (success) {
    showJoinModal.value = false;
    joinStep.value = 1;
    router.push('/game');
  }
};

const handleNewJoin = async () => {
  const success = await joinAsNewPlayer(gameCode.value, buyIn.value);
  if (success) {
    showJoinModal.value = false;
    joinStep.value = 1;
    router.push('/game');
  }
};
</script>
