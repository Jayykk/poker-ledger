<template>
  <div class="bg-slate-900 rounded-lg p-3 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 text-sm font-bold text-white">
        <i class="fas fa-camera text-amber-400"></i>
        <span>{{ $t('hand.recognition.button') }}</span>
      </div>
      <button
        v-if="!loading && (hasResults || previewUrl)"
        @click="reset"
        type="button"
        class="text-xs text-gray-400 hover:text-white"
      >
        <i class="fas fa-redo mr-1"></i>{{ $t('hand.recognition.retake') }}
      </button>
    </div>

    <!-- Idle: pick / take a photo -->
    <div v-if="!loading && !hasResults" class="space-y-2">
      <div class="flex items-start gap-3">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt=""
          class="w-14 h-14 object-cover rounded-lg border border-slate-700 flex-shrink-0"
        />
        <p class="text-xs text-gray-400 leading-relaxed">{{ $t('hand.recognition.hint') }}</p>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <BaseButton variant="secondary" size="sm" @click="openPicker(cameraInput)">
          <i class="fas fa-camera mr-1"></i>{{ $t('hand.recognition.takePhoto') }}
        </BaseButton>
        <BaseButton variant="ghost" size="sm" @click="openPicker(fileInput)">
          <i class="fas fa-image mr-1"></i>{{ $t('hand.recognition.chooseImage') }}
        </BaseButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center gap-3">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt=""
        class="w-14 h-14 object-cover rounded-lg border border-slate-700 flex-shrink-0"
      />
      <div class="text-sm text-gray-300">
        <i class="fas fa-spinner fa-spin mr-2 text-amber-400"></i>{{ $t('hand.recognition.analyzing') }}
      </div>
    </div>

    <!-- Results: assign each card -->
    <div v-if="!loading && hasResults" class="space-y-3">
      <div class="flex items-center gap-3">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt=""
          class="w-14 h-14 object-cover rounded-lg border border-slate-700 flex-shrink-0"
        />
        <div class="text-xs text-gray-400">
          <div class="text-white font-bold">
            {{ $t('hand.recognition.recognizedCards') }} ({{ items.length }})
          </div>
          <div>{{ $t('hand.recognition.tapToAssign') }}</div>
        </div>
      </div>

      <!-- Card chips -->
      <div class="flex gap-2 flex-wrap">
        <div
          v-for="(item, idx) in items"
          :key="item.card"
          role="button"
          :tabindex="isInForm(item.card) ? -1 : 0"
          @click="selectItem(idx)"
          @keydown.enter.prevent="selectItem(idx)"
          :class="[
            'inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border transition select-none',
            isInForm(item.card)
              ? 'bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed'
              : selectedIdx === idx
                ? 'bg-amber-900/40 border-amber-500 cursor-pointer'
                : item.target
                  ? 'bg-emerald-900/30 border-emerald-700 cursor-pointer'
                  : 'bg-slate-700 border-slate-600 cursor-pointer hover:bg-slate-600'
          ]"
        >
          <div class="flex flex-col leading-tight">
            <span :class="['font-bold', getCardColor(item.card)]">{{ item.card }}</span>
            <span class="text-[10px] text-gray-400 whitespace-nowrap">{{ targetLabel(item) }}</span>
          </div>
          <button
            @click.stop="removeItem(idx)"
            type="button"
            class="text-gray-400 hover:text-white text-xs px-1"
            :aria-label="$t('common.delete')"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Target row (shown while a chip is selected) -->
      <div v-if="selectedIdx !== null" class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="target in targets"
          :key="target.id"
          @click="assign(target.id)"
          :disabled="isTargetFull(target) && items[selectedIdx]?.target !== target.id"
          type="button"
          :class="[
            'flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition',
            items[selectedIdx]?.target === target.id
              ? 'bg-amber-600 text-white'
              : isTargetFull(target)
                ? 'bg-slate-800 text-gray-600 cursor-not-allowed'
                : 'bg-slate-700 text-gray-200 hover:bg-slate-600'
          ]"
        >
          {{ target.label }}
          <span class="ml-1 text-[10px] font-normal opacity-80">{{ targetCount(target) }}/{{ target.max }}</span>
        </button>
      </div>

      <BaseButton
        @click="apply"
        :disabled="assignedCount === 0"
        variant="primary"
        fullWidth
      >
        {{ $t('hand.recognition.apply') }}
        <span v-if="assignedCount > 0" class="ml-1 opacity-80">({{ assignedCount }})</span>
      </BaseButton>
    </div>

    <!-- Hidden file inputs -->
    <input
      ref="cameraInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="handleFileChange"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCardRecognition } from '../../composables/useCardRecognition.js';
import { useNotification } from '../../composables/useNotification.js';
import { CARD_LIMITS } from '../../utils/constants.js';
import { getCardColor } from '../../utils/cards.js';
import BaseButton from '../common/BaseButton.vue';

const COMMUNITY_TARGET = 'community';

const props = defineProps({
  /** Cards currently in the community slot of the form */
  communityCards: {
    type: Array,
    default: () => []
  },
  /** handRecord.players — [{ playerId, playerName, participating, cards }] */
  players: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['apply']);

const { t } = useI18n();
const { loading, recognizeCards } = useCardRecognition();
const { error } = useNotification();

const cameraInput = ref(null);
const fileInput = ref(null);
const previewUrl = ref(null);
/** @type {import('vue').Ref<Array<{ card: string, target: string | null }>>} */
const items = ref([]);
const selectedIdx = ref(null);

const hasResults = computed(() => items.value.length > 0);

const participatingPlayers = computed(() =>
  props.players.filter((p) => p.participating !== false)
);

const targets = computed(() => [
  { id: COMMUNITY_TARGET, label: t('hand.communityCards'), max: CARD_LIMITS.COMMUNITY_MAX, existing: props.communityCards.length },
  ...participatingPlayers.value.map((p) => ({
    id: p.playerId,
    label: p.playerName,
    max: CARD_LIMITS.PLAYER_HAND_MAX,
    existing: (p.cards || []).length
  }))
]);

const cardsInForm = computed(() => {
  const set = new Set(props.communityCards);
  participatingPlayers.value.forEach((p) => (p.cards || []).forEach((c) => set.add(c)));
  return set;
});

const isInForm = (card) => cardsInForm.value.has(card);

const assignedInPanel = (targetId) => items.value.filter((i) => i.target === targetId).length;
const targetCount = (target) => target.existing + assignedInPanel(target.id);
const isTargetFull = (target) => targetCount(target) >= target.max;

const assignedCount = computed(() => items.value.filter((i) => i.target && !isInForm(i.card)).length);

const targetLabel = (item) => {
  if (isInForm(item.card)) return t('hand.recognition.alreadyInForm');
  if (!item.target) return t('hand.recognition.unassigned');
  const target = targets.value.find((x) => x.id === item.target);
  return target ? target.label : t('hand.recognition.unassigned');
};

const revokePreview = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
};

const reset = () => {
  items.value = [];
  selectedIdx.value = null;
  revokePreview();
};

const openPicker = (input) => {
  if (loading.value || !input) return;
  input.click();
};

const handleFileChange = async (event) => {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = ''; // allow re-selecting the same file
  if (!file) return;

  revokePreview();
  previewUrl.value = URL.createObjectURL(file);
  items.value = [];
  selectedIdx.value = null;

  try {
    const cards = await recognizeCards(file);
    items.value = cards.map((card) => ({ card, target: null }));
  } catch (e) {
    const code = e?.code || 'unknown';
    error(t(`hand.recognition.errors.${code}`));
  }
};

const selectItem = (idx) => {
  if (isInForm(items.value[idx].card)) return;
  selectedIdx.value = selectedIdx.value === idx ? null : idx;
};

const removeItem = (idx) => {
  items.value.splice(idx, 1);
  if (selectedIdx.value === null) return;
  if (selectedIdx.value === idx) selectedIdx.value = null;
  else if (selectedIdx.value > idx) selectedIdx.value -= 1;
};

const assign = (targetId) => {
  if (selectedIdx.value === null) return;
  const item = items.value[selectedIdx.value];
  if (item.target === targetId) {
    item.target = null; // toggle off
    return;
  }
  const target = targets.value.find((x) => x.id === targetId);
  if (!target || isTargetFull(target)) return;
  item.target = targetId;
  selectedIdx.value = null;
};

const apply = () => {
  const communityCards = [];
  const playerCards = {};
  for (const item of items.value) {
    if (!item.target || isInForm(item.card)) continue;
    if (item.target === COMMUNITY_TARGET) {
      communityCards.push(item.card);
    } else {
      (playerCards[item.target] ||= []).push(item.card);
    }
  }
  if (communityCards.length === 0 && Object.keys(playerCards).length === 0) return;
  emit('apply', { communityCards, playerCards });
  reset();
};

onBeforeUnmount(revokePreview);

defineExpose({ reset });
</script>
