<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.back()" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">
          {{ isEditing ? $t('cashPreset.editPreset') : $t('cashPreset.createPreset') }}
        </h1>
        <button
          @click="handleSave"
          :disabled="!canSave"
          class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <!-- Preset name -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">{{ $t('cashPreset.name') }}</label>
        <BaseInput
          v-model="form.name"
          :placeholder="$t('cashPreset.namePlaceholder')"
        />
      </div>

      <!-- Buy-in chips -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.buyIn') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.buyInHint') }}</span>
        </label>
        <div class="flex gap-2 items-center">
          <BaseButton @click="decrementBuyIn" size="sm">-{{ CHIP_STEP }}</BaseButton>
          <BaseInput
            v-model.number="form.buyIn"
            type="number"
            :min="MIN_BUY_IN"
            :step="CHIP_STEP"
            class="flex-1"
          />
          <BaseButton @click="incrementBuyIn" size="sm">+{{ CHIP_STEP }}</BaseButton>
          <span class="text-white text-sm">{{ $t('game.chips') }}</span>
        </div>
      </div>

      <!-- Settlement rate -->
      <div class="space-y-2">
        <label class="text-sm font-bold text-gray-300">
          {{ $t('cashPreset.rate') }}
          <span class="text-xs text-gray-500 font-normal ml-2">{{ $t('cashPreset.rateHint') }}</span>
        </label>
        <div class="flex gap-2 items-center">
          <span class="text-white text-sm">1 :</span>
          <BaseInput
            v-model.number="form.rate"
            type="number"
            min="0.001"
            step="0.1"
            class="flex-1"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useCashPresets } from '../composables/useCashPresets.js';
import { useNotification } from '../composables/useNotification.js';
import BaseInput from '../components/common/BaseInput.vue';
import BaseButton from '../components/common/BaseButton.vue';
import { DEFAULT_BUY_IN, MIN_BUY_IN, CHIP_STEP } from '../utils/constants.js';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { listenPresets, savePreset } = useCashPresets();

const presetId = computed(() => route.params.presetId || null);
const isEditing = computed(() => Boolean(presetId.value));

const form = ref({
  name: '',
  buyIn: DEFAULT_BUY_IN,
  rate: 1,
});

const canSave = computed(() => {
  const buyIn = Number(form.value.buyIn);
  const rate = Number(form.value.rate);
  return (
    form.value.name.trim().length > 0 &&
    Number.isFinite(buyIn) &&
    buyIn >= MIN_BUY_IN &&
    Number.isFinite(rate) &&
    rate > 0
  );
});

let unsubPresets = null;

onMounted(() => {
  if (!isEditing.value) return;
  // Load existing preset for editing.
  unsubPresets = listenPresets((presets) => {
    const found = presets.find((p) => p.id === presetId.value);
    if (found) {
      form.value = {
        name: found.name || '',
        buyIn: found.buyIn || DEFAULT_BUY_IN,
        rate: found.rate || 1,
      };
    }
  });
});

onUnmounted(() => {
  if (unsubPresets) unsubPresets();
});

function incrementBuyIn() {
  form.value.buyIn = (Number(form.value.buyIn) || 0) + CHIP_STEP;
}

function decrementBuyIn() {
  const next = (Number(form.value.buyIn) || 0) - CHIP_STEP;
  form.value.buyIn = Math.max(MIN_BUY_IN, next);
}

async function handleSave() {
  if (!canSave.value) {
    showError(t('cashPreset.invalidInput'));
    return;
  }
  try {
    await savePreset(
      {
        name: form.value.name.trim(),
        buyIn: Number(form.value.buyIn),
        rate: Number(form.value.rate),
      },
      presetId.value
    );
    success(t('common.save') + ' ✓');
    router.push('/cash-presets');
  } catch (e) {
    showError(e.message);
  }
}
</script>
