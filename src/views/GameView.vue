<template>
  <div v-if="!game" class="h-[80vh] flex flex-col items-center justify-center text-gray-500 gap-4">
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
    <div class="mt-8 flex gap-3 justify-center">
      <BaseButton @click="handleCopyId" variant="ghost" size="sm">
        <i class="fas fa-copy mr-1"></i>{{ $t('game.copyId') }}
      </BaseButton>
      <BaseButton @click="showSettlement = true" variant="secondary">
        {{ $t('game.settlement') }}
      </BaseButton>
    </div>

    <BaseButton
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
          <label class="text-xs text-gray-400 block mb-2">{{ $t('game.buyIn') }}</label>
          <div class="flex gap-2 items-center">
            <BaseButton @click="editingPlayer.buyIn += 100" size="sm">+</BaseButton>
            <span class="text-white font-mono flex-1 text-center">{{ editingPlayer?.buyIn }}</span>
            <BaseButton @click="editingPlayer.buyIn -= 100" size="sm">-</BaseButton>
          </div>
        </div>
        <BaseInput
          v-model.number="editingPlayer.stack"
          type="number"
          :label="$t('game.stack')"
        />
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { useGame } from '../composables/useGame.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import BaseModal from '../components/common/BaseModal.vue';
import PlayerCard from '../components/game/PlayerCard.vue';
import { formatNumber, formatCash, calculateNet } from '../utils/formatters.js';
import { generateTextReport } from '../utils/exportReport.js';
import { DEFAULT_EXCHANGE_RATE } from '../utils/constants.js';

const { t } = useI18n();
const router = useRouter();
const { user } = useAuth();
const { game, totalPot, totalStack, gap, isHost, myPlayer, addPlayer, updatePlayer, removePlayer, bindSeat, settleGame, closeGame } = useGame();
const { success, copyWithNotification } = useNotification();
const { confirm } = useConfirm();

const showAddPlayer = ref(false);
const showEditPlayer = ref(false);
const showSettlement = ref(false);
const newPlayerName = ref('');
const editingPlayer = ref(null);
const exchangeRate = ref(DEFAULT_EXCHANGE_RATE);

const sortedPlayers = computed(() => {
  if (!game.value) return [];
  return [...game.value.players].sort((a, b) => calculateNet(b) - calculateNet(a));
});

const handleAddPlayer = async () => {
  await addPlayer(newPlayerName.value || 'Player');
  showAddPlayer.value = false;
  newPlayerName.value = '';
};

const handleEditPlayer = (player) => {
  editingPlayer.value = { ...player };
  showEditPlayer.value = true;
};

const handleSavePlayer = async () => {
  await updatePlayer(editingPlayer.value);
  showEditPlayer.value = false;
  editingPlayer.value = null;
};

const handleRemovePlayer = async () => {
  const shouldRemove = await confirm({
    message: t('game.confirmRemove'),
    type: 'danger'
  });
  if (shouldRemove) {
    await removePlayer(editingPlayer.value);
    showEditPlayer.value = false;
    editingPlayer.value = null;
  }
};

const handleBind = async (player) => {
  const shouldBind = await confirm({
    message: t('game.confirmBind'),
    type: 'info'
  });
  if (shouldBind) {
    await bindSeat(player);
  }
};

const handleInvite = async (player) => {
  const url = `${window.location.origin}${window.location.pathname}?game=${game.value.id}&seat=${player.id}`;
  await copyWithNotification(url, t('common.copy'));
};

const handleAddBuy = async (player) => {
  await updatePlayer({ ...player, buyIn: player.buyIn + 2000 });
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
    const success = await settleGame(exchangeRate.value);
    if (success) {
      showSettlement.value = false;
      router.push('/report');
    }
  }
};

const handleCloseGame = async () => {
  const shouldClose = await confirm({
    message: t('game.confirmClose'),
    type: 'danger'
  });
  if (shouldClose) {
    const success = await closeGame();
    if (success) {
      router.push('/lobby');
    }
  }
};
</script>
