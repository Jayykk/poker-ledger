<template>
  <BaseCard padding="md" :clickable="false">
    <div class="relative">
      <!-- Color indicator -->
      <div
        class="absolute left-0 inset-y-0 w-1 rounded-l-2xl"
        :class="colorBarClass"
      ></div>

      <div class="pl-4">
        <!-- Player info header -->
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-white font-bold truncate" :class="{ 'opacity-40': player.eliminated && player.placement !== 1 }">
                {{ player.name }}
              </span>
              <span v-if="player.uid" class="text-blue-400 text-[10px]">●</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              {{ $t('tournament.totalBuyIn') }}: ${{ formatNumber(player.buyIn || 0) }}
              <span v-if="entryCount > 1" class="text-gray-500 ml-1">({{ entryCount }}{{ $t('tournament.entryUnit') }})</span>
            </div>
          </div>

          <!-- Placement badge -->
          <div class="text-right flex-shrink-0 ml-2">
            <div v-if="isChampion || player.placement === 1" class="flex items-center gap-1">
              <span class="text-2xl">🏆</span>
              <span class="text-amber-400 font-bold text-sm">{{ $t('tournament.champion') }}</span>
            </div>
            <div v-else-if="player.placement" class="px-2 py-1 bg-slate-700 rounded text-gray-300 text-sm font-mono">
              #{{ player.placement }}
            </div>
            <div v-else class="px-2 py-1 bg-emerald-500/20 rounded text-emerald-400 text-xs font-semibold">
              {{ $t('tournament.inPlay') }}
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2 mt-2">
          <!-- Eliminate button (active players only) -->
          <BaseButton
            v-if="!player.eliminated"
            @click="$emit('eliminate', player)"
            variant="danger"
            size="sm"
            class="flex-1"
          >
            <i class="fas fa-skull-crossbones mr-1"></i>{{ $t('tournament.eliminate') }}
          </BaseButton>

          <!-- Re-entry button (eliminated + within level limit) -->
          <BaseButton
            v-if="player.eliminated && canReentry && player.placement !== 1"
            @click="$emit('reentry', player)"
            variant="secondary"
            size="sm"
            class="flex-1"
          >
            <i class="fas fa-redo mr-1"></i>{{ $t('tournament.reentryAction') }}
          </BaseButton>

          <!-- Edit button: name correction only -->
          <BaseButton
            v-if="!player.eliminated"
            @click="$emit('edit', player)"
            variant="ghost"
            size="sm"
          >
            <i class="fas fa-edit"></i>
          </BaseButton>
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
import { formatNumber } from '../../utils/formatters.js';

const { t } = useI18n();

const props = defineProps({
  player: { type: Object, required: true },
  isHost: { type: Boolean, default: false },
  canReentry: { type: Boolean, default: false },
  baseBuyIn: { type: Number, default: 0 },
  isChampion: { type: Boolean, default: false },
});

defineEmits(['eliminate', 'reentry', 'edit']);

const entryCount = computed(() => {
  if (!props.baseBuyIn || props.baseBuyIn <= 0) return 1;
  return Math.max(1, Math.round((props.player.buyIn || 0) / props.baseBuyIn));
});

const colorBarClass = computed(() => {
  if (props.player.placement === 1) return 'bg-amber-400';
  if (props.player.eliminated) return 'bg-gray-600';
  return 'bg-emerald-500';
});
</script>
