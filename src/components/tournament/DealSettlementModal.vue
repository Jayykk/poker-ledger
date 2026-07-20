<template>
  <BaseModal v-model="visible" :title="$t('tournament.dealTitle')">
    <!-- Remaining pool being negotiated (places 1..N only) -->
    <div class="flex justify-between bg-slate-900 p-3 rounded mb-3">
      <span class="text-gray-400 text-sm">{{ $t('tournament.dealRemainingPool') }}</span>
      <span class="text-amber-400 font-bold font-mono">${{ formatNumber(remainingPool) }}</span>
    </div>
    <div class="text-[11px] text-gray-500 mb-3">
      {{ prizes.map(p => `#${p.place} $${formatNumber(p.prize)}`).join(' · ') }}
    </div>

    <!-- Mode tabs -->
    <div class="flex gap-2 mb-4">
      <button
        v-for="m in modes"
        :key="m.value"
        @click="mode = m.value"
        class="flex-1 px-3 py-1.5 rounded-lg text-sm transition"
        :class="mode === m.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
      >
        {{ m.labelKey ? $t(`tournament.${m.labelKey}`) : m.label }}
      </button>
    </div>

    <!-- ICM / Chip Chop: current chip counts -->
    <div v-if="mode !== 'custom'" class="mb-4">
      <div class="text-xs text-gray-400 mb-2">{{ $t('tournament.dealChipsInput') }}</div>
      <div class="space-y-2">
        <div v-for="p in players" :key="p.id" class="flex items-center gap-3">
          <span class="text-white text-sm flex-1 truncate">{{ p.name }}</span>
          <input
            v-model.number="stacks[p.id]"
            type="number"
            min="0"
            inputmode="numeric"
            class="w-28 bg-slate-700 text-white text-sm rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-amber-500 text-right font-mono"
          />
        </div>
      </div>
      <!-- Abandoned/dead chips: when a player left and their chips were removed
           from play, the survivors' total is less than entries × startingChips.
           Subtracting this makes the sanity check match reality. -->
      <div v-if="expectedChips > 0" class="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700">
        <span class="text-white text-sm flex-1">
          {{ $t('tournament.dealDeadChips') }}
        </span>
        <input
          v-model.number="deadChips"
          type="number"
          min="0"
          inputmode="numeric"
          class="w-28 bg-slate-700 text-white text-sm rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-amber-500 text-right font-mono"
        />
      </div>
      <div v-if="expectedChips > 0" class="text-[11px] text-gray-500 mt-1">
        {{ $t('tournament.dealDeadChipsHint') }}
      </div>

      <div class="flex justify-between text-xs mt-2" :class="chipsMatch ? 'text-gray-400' : 'text-rose-400'">
        <span>{{ $t('tournament.dealChipsTotal') }}: {{ formatNumber(stacksTotal) }}</span>
        <span v-if="expectedChips > 0">
          {{ $t('tournament.dealChipsExpected') }}: {{ formatNumber(effectiveExpectedChips) }}
        </span>
      </div>
    </div>

    <!-- Custom: negotiated amounts + champion pick -->
    <div v-else class="mb-4">
      <div class="text-xs text-gray-400 mb-2">
        {{ $t('tournament.dealCustomAmount') }} · {{ $t('tournament.dealSelectChampion') }} 🏆
      </div>
      <div class="space-y-2">
        <div v-for="p in players" :key="p.id" class="flex items-center gap-3">
          <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
            <input type="radio" :value="p.id" v-model="championId" class="accent-amber-500" />
            <span class="text-white text-sm truncate">{{ p.name }}</span>
          </label>
          <input
            v-model.number="amounts[p.id]"
            type="number"
            min="0"
            inputmode="numeric"
            class="w-28 bg-slate-700 text-white text-sm rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-amber-500 text-right font-mono"
          />
        </div>
      </div>
      <div class="flex justify-between text-xs mt-2" :class="amountsMatch ? 'text-gray-400' : 'text-rose-400'">
        <span>{{ $t('tournament.dealAmountSum') }}: ${{ formatNumber(amountsTotal) }}</span>
        <span>{{ $t('tournament.dealRemainingPool') }}: ${{ formatNumber(remainingPool) }}</span>
      </div>
    </div>

    <!-- Allocation preview -->
    <div v-if="allocations.length > 0" class="mb-4">
      <div class="text-xs text-gray-400 mb-2">{{ $t('tournament.dealPreview') }}</div>
      <div class="space-y-1">
        <div
          v-for="a in allocations"
          :key="a.playerId"
          class="flex justify-between text-sm py-1 border-b border-slate-700"
        >
          <span class="text-gray-300">
            <span class="font-mono w-6 inline-block">#{{ a.placement }}</span>
            <span class="text-white">{{ a.name }}</span>
            <span v-if="a.placement === 1" class="ml-1">🏆</span>
          </span>
          <span class="text-emerald-400 font-mono">${{ formatNumber(a.prize) }}</span>
        </div>
      </div>
    </div>

    <!-- Approvals: every remaining player must (verbally) agree; the host
         checks them off — recorded into the deal for the audit trail -->
    <div class="mb-4">
      <div class="text-xs text-gray-400 mb-1">{{ $t('tournament.dealApprovals') }}</div>
      <div class="text-[11px] text-gray-500 mb-2">{{ $t('tournament.dealApprovalHint') }}</div>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="p in players"
          :key="p.id"
          class="flex items-center gap-1.5 bg-slate-700 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer"
          :class="approvals[p.id] ? 'text-emerald-300 border border-emerald-500/50' : 'text-gray-300 border border-transparent'"
        >
          <input type="checkbox" v-model="approvals[p.id]" class="accent-emerald-500" />
          <span class="truncate max-w-[8rem]">{{ p.name }}</span>
        </label>
      </div>
    </div>

    <!-- Why confirm is disabled -->
    <div v-if="blockReason" class="text-rose-400 text-center text-xs mb-3">
      <i class="fas fa-exclamation-triangle mr-1"></i>{{ blockReason }}
    </div>

    <BaseButton variant="primary" fullWidth :disabled="!canConfirm" @click="handleConfirm">
      {{ $t('tournament.dealConfirm') }}
    </BaseButton>
  </BaseModal>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import { formatNumber } from '../../utils/formatters.js';
import { computeIcmPayouts, computeChipChopPayouts } from '../../utils/settlementMath.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Currently-alive players: [{id, name, buyIn}] */
  players: { type: Array, default: () => [] },
  /** Undecided prizes, places 1..players.length: [{place, prize}] */
  prizes: { type: Array, default: () => [] },
  /** Total chips in play (entries × startingChips); 0 = unknown, skip check */
  expectedChips: { type: Number, default: 0 },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const { t } = useI18n();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const modes = [
  { value: 'icm', label: 'ICM' },
  { value: 'chipchop', label: 'Chip Chop' },
  { value: 'custom', labelKey: 'dealCustom' },
];

const mode = ref('icm');
const stacks = reactive({});
const amounts = reactive({});
const championId = ref(null);
const approvals = reactive({});
const deadChips = ref(0);

// Reset all inputs each time the modal opens (player set may have changed)
watch(() => props.modelValue, (open) => {
  if (!open) return;
  mode.value = 'icm';
  championId.value = null;
  deadChips.value = 0;
  for (const key of Object.keys(stacks)) delete stacks[key];
  for (const key of Object.keys(amounts)) delete amounts[key];
  for (const key of Object.keys(approvals)) delete approvals[key];
  for (const p of props.players) {
    stacks[p.id] = null;
    amounts[p.id] = null;
    approvals[p.id] = false;
  }
});

// Expected chips still on the table = entries × startingChips minus any chips
// that left play (abandoned / dead chips the host entered).
const effectiveExpectedChips = computed(() =>
  Math.max(0, props.expectedChips - (Number(deadChips.value) || 0))
);

const remainingPool = computed(() =>
  props.prizes.reduce((sum, p) => sum + (Number(p.prize) || 0), 0)
);

const stacksTotal = computed(() =>
  props.players.reduce((sum, p) => sum + (Number(stacks[p.id]) || 0), 0)
);
const stacksAllPositive = computed(() =>
  props.players.every((p) => (Number(stacks[p.id]) || 0) > 0)
);
const chipsMatch = computed(() =>
  props.expectedChips <= 0 || stacksTotal.value === effectiveExpectedChips.value
);

const amountsTotal = computed(() =>
  props.players.reduce((sum, p) => sum + (Number(amounts[p.id]) || 0), 0)
);
const amountsMatch = computed(() => amountsTotal.value === remainingPool.value);

const allApproved = computed(() =>
  props.players.length > 0 && props.players.every((p) => approvals[p.id])
);

/** Deal allocations: [{playerId, name, prize, placement}] or [] while invalid */
const allocations = computed(() => {
  const players = props.players;

  if (mode.value === 'custom') {
    if (!championId.value || !amountsMatch.value) return [];
    const champion = players.find((p) => p.id === championId.value);
    if (!champion) return [];
    // Champion is place 1; the rest rank by negotiated amount (ties: seat order)
    const rest = players
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => p.id !== championId.value)
      .sort((a, b) =>
        (Number(amounts[b.p.id]) || 0) - (Number(amounts[a.p.id]) || 0) || a.index - b.index
      );
    return [
      { playerId: champion.id, name: champion.name, prize: Number(amounts[champion.id]) || 0, placement: 1 },
      ...rest.map(({ p }, i) => ({
        playerId: p.id,
        name: p.name,
        prize: Number(amounts[p.id]) || 0,
        placement: i + 2,
      })),
    ];
  }

  // ICM / Chip Chop need every stack entered (and matching the expected total)
  if (!stacksAllPositive.value || !chipsMatch.value) return [];
  const stackList = players.map((p) => Number(stacks[p.id]) || 0);
  const prizeList = props.prizes.map((p) => Number(p.prize) || 0);
  const payouts = mode.value === 'icm'
    ? computeIcmPayouts(stackList, prizeList)
    : computeChipChopPayouts(stackList, remainingPool.value);

  // Placement = chip-count ranking (ties: seat order)
  const ranked = players
    .map((p, index) => ({ p, index, stack: stackList[index], prize: payouts[index] }))
    .sort((a, b) => b.stack - a.stack || a.index - b.index);

  return ranked.map((entry, i) => ({
    playerId: entry.p.id,
    name: entry.p.name,
    prize: entry.prize,
    placement: i + 1,
  }));
});

const blockReason = computed(() => {
  if (mode.value === 'custom') {
    if (!amountsMatch.value) return t('tournament.dealMismatch');
    if (!championId.value) return t('tournament.dealSelectChampion');
  } else {
    if (!stacksAllPositive.value) return t('tournament.dealChipsInput');
    if (!chipsMatch.value) return t('tournament.dealChipsMismatch');
  }
  if (!allApproved.value) return t('tournament.dealApprovals');
  return '';
});

const canConfirm = computed(() => allocations.value.length > 0 && allApproved.value);

const handleConfirm = () => {
  if (!canConfirm.value) return;
  emit('confirm', {
    mode: mode.value,
    stacks: mode.value === 'custom'
      ? null
      : Object.fromEntries(props.players.map((p) => [p.id, Number(stacks[p.id]) || 0])),
    deadChips: mode.value === 'custom' ? 0 : (Number(deadChips.value) || 0),
    allocations: allocations.value.map(({ playerId, prize, placement }) => ({ playerId, prize, placement })),
    approvals: props.players.map((p) => ({ playerId: p.id, name: p.name })),
  });
};
</script>
