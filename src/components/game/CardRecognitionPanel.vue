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

    <!-- Results: select cards (multi) then assign -->
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

      <div
        v-if="autoAssignedCount > 0"
        class="text-xs text-amber-300 bg-amber-900/30 border border-amber-800 rounded-lg px-2 py-1.5"
      >
        <i class="fas fa-magic mr-1"></i>{{ $t('hand.recognition.autoAssigned', { count: autoAssignedCount }) }}
      </div>

      <!-- Groups of cards (grouped by physical placement on the table) -->
      <div class="space-y-2">
        <div
          v-for="group in groups"
          :key="group.id"
          class="flex items-start gap-2 flex-wrap rounded-lg border border-slate-800 p-2"
        >
          <button
            v-if="group.selectable.length > 0"
            @click="toggleGroup(group)"
            type="button"
            :class="[
              'flex-shrink-0 self-center px-2 py-1 rounded-md text-[11px] font-bold transition',
              isGroupSelected(group)
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            ]"
            :title="$t('hand.recognition.selectGroup')"
          >
            <i class="fas fa-object-group mr-1"></i>{{ group.items.length }}
          </button>

          <div
            v-for="item in group.items"
            :key="item.card"
            role="button"
            :tabindex="isInForm(item.card) ? -1 : 0"
            @click="toggleCard(item.card)"
            @keydown.enter.prevent="toggleCard(item.card)"
            :class="[
              'inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border transition select-none',
              isInForm(item.card)
                ? 'bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed'
                : isSelected(item.card)
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
              @click.stop="removeItem(item.card)"
              type="button"
              class="text-gray-400 hover:text-white text-xs px-1"
              :aria-label="$t('common.delete')"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Target row (shown while cards are selected) -->
      <div v-if="selected.length > 0" class="space-y-2">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>{{ $t('hand.recognition.selectedCount', { count: selected.length }) }}</span>
          <button
            v-if="selectedHasTarget"
            @click="clearAssignment"
            type="button"
            class="text-rose-300 hover:text-rose-200"
          >
            <i class="fas fa-eraser mr-1"></i>{{ $t('hand.recognition.clearAssignment') }}
          </button>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="target in targets"
            :key="target.id"
            @click="assign(target.id)"
            :disabled="!canAssign(target)"
            type="button"
            :class="[
              'flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition',
              canAssign(target)
                ? 'bg-slate-700 text-gray-200 hover:bg-amber-600 hover:text-white'
                : 'bg-slate-800 text-gray-600 cursor-not-allowed'
            ]"
          >
            {{ target.label }}
            <span class="ml-1 text-[10px] font-normal opacity-80">{{ targetCount(target) }}/{{ target.max }}</span>
          </button>
        </div>
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
import { suggestCommunityGroup } from '../../utils/cardRecognition.js';
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
/** @type {import('vue').Ref<Array<{ card: string, group: number, target: string | null }>>} */
const items = ref([]);
/** Currently selected card strings (multi-select) */
const selected = ref([]);
const autoAssignedCount = ref(0);

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
const isSelected = (card) => selected.value.includes(card);

/** Items grouped by the physical placement group the model returned. */
const groups = computed(() => {
  const map = new Map();
  for (const item of items.value) {
    if (!map.has(item.group)) map.set(item.group, { id: item.group, items: [], selectable: [] });
    const g = map.get(item.group);
    g.items.push(item);
    if (!isInForm(item.card)) g.selectable.push(item.card);
  }
  return [...map.values()];
});

const isGroupSelected = (group) =>
  group.selectable.length > 0 && group.selectable.every((c) => isSelected(c));

/** Cards already assigned to `targetId` in the panel, excluding the current selection. */
const assignedOutsideSelection = (targetId) =>
  items.value.filter((i) => i.target === targetId && !isSelected(i.card) && !isInForm(i.card)).length;

const targetCount = (target) => target.existing + assignedOutsideSelection(target.id);

const canAssign = (target) => {
  const n = selected.value.length;
  if (n === 0) return false;
  return n <= target.max - target.existing - assignedOutsideSelection(target.id);
};

const assignedCount = computed(() => items.value.filter((i) => i.target && !isInForm(i.card)).length);
const selectedHasTarget = computed(() => items.value.some((i) => i.target && isSelected(i.card)));

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
  selected.value = [];
  autoAssignedCount.value = 0;
  revokePreview();
};

const openPicker = (input) => {
  if (loading.value || !input) return;
  input.click();
};

/** Pre-assign the board group (3-5 cards in a row) to community when the form's board is still empty. */
const autoAssignCommunity = (recognition) => {
  autoAssignedCount.value = 0;
  if (props.communityCards.length > 0) return;
  const group = suggestCommunityGroup(recognition);
  if (group === null) return;
  let count = 0;
  for (const item of items.value) {
    if (item.group !== group || isInForm(item.card)) continue;
    if (count >= CARD_LIMITS.COMMUNITY_MAX) break;
    item.target = COMMUNITY_TARGET;
    count += 1;
  }
  autoAssignedCount.value = count;
};

const handleFileChange = async (event) => {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = ''; // allow re-selecting the same file
  if (!file) return;

  revokePreview();
  previewUrl.value = URL.createObjectURL(file);
  items.value = [];
  selected.value = [];
  autoAssignedCount.value = 0;

  try {
    const recognition = await recognizeCards(file);
    items.value = recognition.cards.map(({ card, group }) => ({ card, group, target: null }));
    autoAssignCommunity(recognition);
  } catch (e) {
    const code = e?.code || 'unknown';
    error(t(`hand.recognition.errors.${code}`));
  }
};

const toggleCard = (card) => {
  if (isInForm(card)) return;
  if (isSelected(card)) {
    selected.value = selected.value.filter((c) => c !== card);
  } else {
    selected.value = [...selected.value, card];
  }
};

const toggleGroup = (group) => {
  if (isGroupSelected(group)) {
    selected.value = selected.value.filter((c) => !group.selectable.includes(c));
  } else {
    const missing = group.selectable.filter((c) => !isSelected(c));
    selected.value = [...selected.value, ...missing];
  }
};

const removeItem = (card) => {
  items.value = items.value.filter((i) => i.card !== card);
  selected.value = selected.value.filter((c) => c !== card);
};

const assign = (targetId) => {
  const target = targets.value.find((x) => x.id === targetId);
  if (!target || !canAssign(target)) return;
  for (const item of items.value) {
    if (isSelected(item.card)) item.target = targetId;
  }
  selected.value = [];
};

const clearAssignment = () => {
  for (const item of items.value) {
    if (isSelected(item.card)) item.target = null;
  }
  selected.value = [];
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
