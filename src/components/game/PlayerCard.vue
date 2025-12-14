<template>
  <BaseCard padding="md" :clickable="false">
    <div class="relative">
      <!-- Color indicator -->
      <div
        class="absolute left-0 inset-y-0 w-1 rounded-l-2xl"
        :class="netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'"
      ></div>

      <div class="pl-4">
        <!-- Player info header -->
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="text-white font-bold flex gap-2 items-center">
              {{ player.name }}
              
              <!-- Bind button for unbound players -->
              <BaseButton
                v-if="!player.uid && canBind"
                @click="$emit('bind', player)"
                size="sm"
                variant="secondary"
              >
                {{ $t('game.bind') }}
              </BaseButton>
              
              <!-- Invite button -->
              <button
                v-if="!player.uid && !canBind"
                @click="$emit('invite', player)"
                class="text-[10px] bg-slate-700 text-gray-400 px-2 py-1 rounded border border-slate-600 hover:text-white"
              >
                <i class="fas fa-share-alt mr-1"></i>{{ $t('game.invite') }}
              </button>
              
              <!-- Online indicator -->
              <span v-if="player.uid" class="text-blue-400 text-[10px]">●</span>
            </div>
            <div class="text-xs text-gray-400 mt-1">
              {{ $t('game.buyIn') }}: {{ formatNumber(player.buyIn) }}
            </div>
            
            <!-- Rebuy history -->
            <div v-if="player.rebuyHistory && player.rebuyHistory.length > 0" class="text-xs text-gray-500 mt-1">
              Rebuys: {{ player.rebuyHistory.length }}
            </div>
          </div>
          
          <!-- Net profit/loss -->
          <div class="text-right">
            <div
              class="text-2xl font-mono font-bold"
              :class="netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ netProfit > 0 ? '+' : '' }}{{ formatNumber(netProfit) }}
            </div>
            <div class="text-xs text-gray-400 mt-1">
              Stack: {{ formatNumber(player.stack || 0) }}
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-3">
          <BaseButton
            @click="$emit('add-buy', player)"
            variant="ghost"
            size="sm"
            fullWidth
          >
            <i class="fas fa-plus mr-1"></i>{{ $t('game.addBuyIn') }}
          </BaseButton>
          <BaseButton
            @click="$emit('edit', player)"
            variant="ghost"
            size="sm"
            fullWidth
          >
            <i class="fas fa-edit mr-1"></i>{{ $t('game.modify') }}
          </BaseButton>
        </div>

        <!-- Notes (if any) -->
        <div v-if="player.notes" class="mt-3 p-2 bg-slate-900 rounded text-xs text-gray-300">
          <i class="fas fa-sticky-note mr-1 text-amber-500"></i>
          {{ player.notes }}
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseCard from '../common/BaseCard.vue';
import BaseButton from '../common/BaseButton.vue';
import { formatNumber, calculateNet } from '../../utils/formatters.js';

const { t } = useI18n();

const props = defineProps({
  player: {
    type: Object,
    required: true
  },
  canBind: {
    type: Boolean,
    default: false
  },
  isMyCard: {
    type: Boolean,
    default: false
  }
});

defineEmits(['bind', 'invite', 'add-buy', 'edit']);

const netProfit = computed(() => calculateNet(props.player));
</script>
