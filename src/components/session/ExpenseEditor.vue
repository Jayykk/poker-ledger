<template>
  <Teleport to="body">
    <!-- Above the bottom nav (z-index 100); toasts and confirm dialogs sit above this -->
    <div v-if="modelValue" class="fixed inset-0 z-[110] bg-slate-900 overflow-y-auto overscroll-contain">
      <div class="w-full max-w-md md:max-w-2xl mx-auto px-4 pt-4 pb-40">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-white">{{ heading }}</h2>
          <button type="button" class="text-gray-400 hover:text-white p-2" @click="requestClose">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>

        <!-- Name + payer -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <label class="block">
            <span class="text-xs text-gray-400">{{ t('expense.editor.titleLabel') }}</span>
            <input
              v-model="draft.title"
              :disabled="!canEdit"
              :placeholder="t('expense.editor.titlePlaceholder')"
              maxlength="100"
              class="field mt-1"
            />
          </label>
          <label class="block">
            <span class="text-xs text-gray-400">{{ t('expense.editor.payer') }}</span>
            <select v-model="draft.payerUid" :disabled="!canChangePayer" class="field mt-1">
              <option v-for="p in pickablePeople" :key="p.uid" :value="p.uid">{{ personLabel(p.uid) }}</option>
            </select>
          </label>
        </div>

        <!-- Receipt recognition -->
        <div v-if="canEdit" class="bg-slate-800 rounded-lg p-3 mb-4 space-y-2">
          <div class="flex items-start gap-3">
            <button
              v-if="previewUrl"
              type="button"
              class="flex-shrink-0"
              @click="showImage = true"
            >
              <img :src="previewUrl" alt="" class="w-14 h-14 object-cover rounded-lg border border-slate-700" />
            </button>
            <p class="text-xs text-gray-400 leading-relaxed">
              <template v-if="recognizing">
                <i class="fas fa-spinner fa-spin mr-1 text-amber-400"></i>{{ t('expense.editor.analyzing') }}
              </template>
              <template v-else>{{ t('expense.editor.scanHint') }}</template>
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" size="sm" :disabled="recognizing" @click="openPicker(cameraInput)">
              <i class="fas fa-camera mr-1"></i>{{ t('expense.editor.takePhoto') }}
            </BaseButton>
            <BaseButton variant="ghost" size="sm" :disabled="recognizing" @click="openPicker(fileInput)">
              <i class="fas fa-image mr-1"></i>{{ t('expense.editor.chooseImage') }}
            </BaseButton>
          </div>
          <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onFile" />
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
        </div>

        <!-- Lines: items then fees -->
        <section v-for="group in groups" :key="group.kind" class="mb-5">
          <button
            v-if="group.kind === 'fee'"
            type="button"
            class="w-full flex items-center justify-between mb-1 py-1 text-left"
            :aria-expanded="feesOpen"
            @click="feesOpen = !feesOpen"
          >
            <h3 class="text-sm font-bold text-white">
              <i class="fas fa-chevron-right text-xs mr-1 transition-transform" :class="{ 'rotate-90': feesOpen }"></i>
              {{ group.title }}
              <span v-if="group.lines.length" class="text-gray-400 font-normal">({{ group.lines.length }})</span>
            </h3>
            <span v-if="!feesOpen && group.lines.length" class="text-xs text-gray-400">{{ feeSummary }}</span>
          </button>
          <div v-else class="flex items-baseline justify-between mb-1">
            <h3 class="text-sm font-bold text-white">{{ group.title }}</h3>
          </div>
          <template v-if="group.kind !== 'fee' || feesOpen">
            <p v-if="canEdit" class="text-xs text-gray-500 mb-2">{{ group.hint }}</p>

            <div
              v-for="line in group.lines"
              :key="line.id"
              class="rounded-lg border p-2 mb-2 transition"
              :class="lineClass(line)"
            >
              <div class="flex items-center gap-2">
                <input
                  v-model="line.charged"
                  type="checkbox"
                  :disabled="!canEdit"
                  class="w-5 h-5 flex-shrink-0 accent-emerald-500"
                />
                <input
                  v-model="line.name"
                  :disabled="!canEdit"
                  :placeholder="t('expense.editor.namePlaceholder')"
                  class="field flex-1 min-w-0"
                />
                <span v-if="line.quantity > 1" class="text-xs text-gray-400 flex-shrink-0">×{{ line.quantity }}</span>
                <input
                  v-model="line.amount"
                  type="number"
                  step="any"
                  :inputmode="line.kind === 'fee' ? undefined : 'decimal'"
                  :disabled="!canEdit"
                  :placeholder="t('expense.editor.amountPlaceholder')"
                  class="field w-24 flex-shrink-0 text-right"
                  :class="{ 'border-rose-500': line.charged && problems.badAmount.includes(line.id) }"
                />
                <button
                  v-if="canEdit"
                  type="button"
                  class="text-gray-500 hover:text-rose-400 text-xs px-1 flex-shrink-0"
                  :aria-label="t('expense.editor.remove')"
                  @click="removeLine(line.id)"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div v-if="line.charged || line.person" class="flex items-center gap-2 mt-2 pl-7">
                <button
                  v-if="line.charged"
                  type="button"
                  :disabled="!canEdit"
                  class="assignee"
                  :class="assigneeClass(line)"
                  @click="openAssign(line)"
                >
                  <i class="fas fa-user-tag mr-1"></i>{{ assigneeText(line) }}
                </button>
                <span v-if="line.person" class="text-xs text-gray-500 truncate">
                  {{ t('expense.editor.receiptName', { name: line.person }) }}
                </span>
              </div>
            </div>

            <button v-if="canEdit" type="button" class="add-line" @click="addLine(group.kind)">
              <i class="fas fa-plus mr-1"></i>{{ group.addLabel }}
            </button>
          </template>
        </section>

        <!-- Totals + who pays the payer -->
        <section class="bg-slate-800 rounded-lg p-3 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">{{ t('expense.editor.chargedTotal') }}</span>
            <span class="font-mono font-bold text-white">${{ fmt(charged) }}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-400">{{ t('expense.editor.receiptTotal') }}</span>
            <input
              v-model="draft.receiptTotal"
              type="number"
              step="any"
              inputmode="decimal"
              :disabled="!canEdit"
              class="field w-28 text-right"
            />
          </div>
          <p v-if="receiptDiff" class="text-xs text-amber-300 text-right">
            {{ t('expense.editor.diff', { amount: fmt(receiptDiff) }) }}
          </p>
          <div class="border-t border-slate-700 pt-2">
            <div class="text-xs text-gray-400 mb-1">
              {{ t('expense.editor.preview', { name: personLabel(draft.payerUid) }) }}
            </div>
            <div v-if="!debts.length" class="text-xs text-gray-500">{{ t('expense.editor.previewEmpty') }}</div>
            <div v-for="d in debts" :key="d.uid" class="flex justify-between text-sm py-0.5">
              <span class="text-white">{{ personLabel(d.uid) }}</span>
              <span class="font-mono text-amber-200">${{ fmt(d.amount) }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Save bar -->
      <div
        v-if="canEdit"
        class="fixed bottom-0 inset-x-0 bg-slate-900/95 border-t border-slate-700 px-4 pt-3"
        style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)"
      >
        <div class="w-full max-w-md md:max-w-2xl mx-auto space-y-2">
          <p v-if="problems.empty" class="text-xs text-gray-400">{{ t('expense.editor.needLine') }}</p>
          <p v-if="problems.unassigned.length" class="text-xs text-rose-300">
            {{ t('expense.editor.needAssign', { count: problems.unassigned.length }) }}
          </p>
          <p v-if="problems.badAmount.length" class="text-xs text-rose-300">
            {{ t('expense.editor.needAmount', { count: problems.badAmount.length }) }}
          </p>
          <div class="flex gap-2">
            <BaseButton v-if="draft.id" variant="danger" :disabled="saving" @click="onDelete">
              <i class="fas fa-trash"></i>
            </BaseButton>
            <BaseButton variant="primary" fullWidth :disabled="!problems.ok || saving || recognizing" @click="onSave">
              {{ t('expense.editor.save') }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Assign sheet -->
      <div v-if="assigning" class="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center" @click.self="assigning = null">
        <div
          class="bg-slate-800 w-full max-w-md rounded-t-2xl p-4"
          style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px)"
        >
          <div class="text-sm font-bold text-white mb-1">{{ t('expense.editor.pickPeople') }}</div>
          <div class="text-xs text-gray-400 mb-3 truncate">
            {{ assigning.name || '—' }}<span v-if="assigning.person"> · {{ t('expense.editor.receiptName', { name: assigning.person }) }}</span>
          </div>
          <div class="flex flex-wrap gap-2 mb-4 max-h-[45vh] overflow-y-auto">
            <button
              v-for="p in pickablePeople"
              :key="p.uid"
              type="button"
              class="chip"
              :class="assigning.assignees.includes(p.uid) ? 'chip-on' : 'chip-off'"
              @click="toggleAssignee(p.uid)"
            >
              {{ personLabel(p.uid) }}
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <BaseButton variant="ghost" size="sm" @click="assigning.assignees = pickablePeople.map((p) => p.uid)">
              {{ t('expense.editor.everyone') }}
            </BaseButton>
            <BaseButton variant="ghost" size="sm" @click="assigning.assignees = []">
              {{ t('expense.editor.clear') }}
            </BaseButton>
            <BaseButton variant="primary" size="sm" @click="assigning = null">
              {{ t('expense.editor.done') }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Full receipt image -->
      <div
        v-if="showImage && previewUrl"
        class="fixed inset-0 z-[60] bg-black/90 overflow-auto"
        @click="showImage = false"
      >
        <img :src="previewUrl" alt="" class="w-full max-w-2xl mx-auto" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '../common/BaseButton.vue';
import { useAuthStore } from '../../store/modules/auth.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirm } from '../../composables/useConfirm.js';
import { useEventExpenses, prewarmReceiptRecognition } from '../../composables/useEventExpenses.js';
import { RECOGNITION_ERROR } from '../../utils/cardRecognition.js';
import {
  LINE_KIND, blankLine, isBlankLine, linesFromReceipt, expenseProblems, expenseDebts,
  chargedTotal, serializeExpense, receiptTitle,
} from '../../utils/eventExpenses.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  sessionId: { type: String, required: true },
  /** Existing expense to edit / view; null for a new one. */
  expense: { type: Object, default: null },
  /** The event's players: [{ uid, name }] */
  people: { type: Array, default: () => [] },
  isHost: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const authStore = useAuthStore();
const { success, error } = useNotification();
const { confirm } = useConfirm();
const { recognizing, recognizeReceipt, saveExpense, deleteExpense } = useEventExpenses();

const myUid = computed(() => authStore.user?.uid || null);

const draft = ref(emptyDraft());
let initialJson = '';
const saving = ref(false);
const assigning = ref(null);
const previewUrl = ref(null);
const showImage = ref(false);
// Fees are the payer's to absorb by default, so their section starts folded
const feesOpen = ref(false);
const cameraInput = ref(null);
const fileInput = ref(null);

function emptyDraft() {
  return {
    id: null,
    title: '',
    payerUid: myUid.value,
    lines: [blankLine(LINE_KIND.ITEM)],
    receiptTotal: null,
    names: {},
    createdBy: myUid.value,
  };
}

function fromExpense(e) {
  return {
    id: e.id,
    title: e.title || '',
    payerUid: e.payerUid,
    lines: (e.lines || []).map((l) => ({ ...blankLine(l.kind), ...l, assignees: [...(l.assignees || [])] })),
    receiptTotal: e.receiptTotal ?? null,
    names: { ...(e.names || {}) },
    createdBy: e.createdBy,
  };
}

const snapshot = () => JSON.stringify(serializeExpense(draft.value, props.people));

watch(() => props.modelValue, (open) => {
  if (!open) return;
  draft.value = props.expense ? fromExpense(props.expense) : emptyDraft();
  initialJson = snapshot();
  assigning.value = null;
  showImage.value = false;
  feesOpen.value = draft.value.lines.some((l) => l.kind === LINE_KIND.FEE && l.charged);
  revokePreview();
}, { immediate: true });

const isNew = computed(() => !draft.value.id);
const canEdit = computed(() => isNew.value || props.isHost
  || draft.value.payerUid === myUid.value || draft.value.createdBy === myUid.value);
// Recording on someone else's behalf is the host's call (mirrors the rules).
const canChangePayer = computed(() => canEdit.value && props.isHost);
const heading = computed(() => {
  if (isNew.value) return t('expense.editor.newTitle');
  return canEdit.value ? t('expense.editor.editTitle') : t('expense.editor.viewTitle');
});

// The event's players, plus anyone this expense already names who has since left.
const pickablePeople = computed(() => {
  const list = [...props.people];
  const seen = new Set(list.map((p) => p.uid));
  for (const [uid, name] of Object.entries(draft.value.names || {})) {
    if (!seen.has(uid)) { list.push({ uid, name }); seen.add(uid); }
  }
  if (draft.value.payerUid && !seen.has(draft.value.payerUid)) {
    list.push({ uid: draft.value.payerUid, name: authStore.displayName });
  }
  return list;
});

function personLabel(uid) {
  const p = pickablePeople.value.find((x) => x.uid === uid);
  const name = p?.name || draft.value.names?.[uid] || '—';
  return uid === myUid.value ? `${name}（${t('expense.me')}）` : name;
}

const groups = computed(() => [
  {
    kind: LINE_KIND.ITEM,
    title: t('expense.editor.items'),
    hint: t('expense.editor.chargedHint'),
    addLabel: t('expense.editor.addItem'),
    lines: draft.value.lines.filter((l) => l.kind !== LINE_KIND.FEE),
  },
  {
    kind: LINE_KIND.FEE,
    title: t('expense.editor.fees'),
    hint: t('expense.editor.feesHint'),
    addLabel: t('expense.editor.addFee'),
    lines: draft.value.lines.filter((l) => l.kind === LINE_KIND.FEE),
  },
]);

const problems = computed(() => expenseProblems(draft.value));
const feeSummary = computed(() => {
  const charged = chargedTotal(draft.value.lines.filter((l) => l.kind === LINE_KIND.FEE));
  return charged ? t('expense.editor.feesCharged', { amount: fmt(charged) }) : t('expense.editor.feesNotCharged');
});
const charged = computed(() => chargedTotal(draft.value.lines));
const debts = computed(() => expenseDebts(draft.value));
const receiptDiff = computed(() => {
  const total = Number(draft.value.receiptTotal);
  if (!draft.value.receiptTotal || !Number.isFinite(total)) return 0;
  const sum = draft.value.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return Math.round((total - sum) * 100) / 100;
});

const fmt = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

function lineClass(line) {
  if (!line.charged) return 'border-slate-800 bg-slate-800/40 opacity-60';
  if (problems.value.unassigned.includes(line.id)) return 'border-rose-500/60 bg-slate-800';
  return 'border-slate-700 bg-slate-800';
}

function assigneeClass(line) {
  if (line.assignees.length) return 'text-emerald-300 border-emerald-500/40';
  // Red only once the line has content (a blank line is just dropped)
  return problems.value.unassigned.includes(line.id)
    ? 'text-rose-300 border-rose-500/60'
    : 'text-gray-400 border-slate-600';
}

function assigneeText(line) {
  if (!line.assignees.length) return t('expense.editor.unassigned');
  if (line.assignees.length === pickablePeople.value.length && line.assignees.length > 2) {
    return t('expense.editor.everyone');
  }
  return line.assignees.map((uid) => personLabel(uid)).join('、');
}

function addLine(kind) {
  const line = blankLine(kind);
  // A fee someone adds by hand is one they mean to share.
  if (kind === LINE_KIND.FEE) line.charged = true;
  draft.value.lines.push(line);
}

function removeLine(id) {
  draft.value.lines = draft.value.lines.filter((l) => l.id !== id);
}

function openAssign(line) {
  if (!canEdit.value) return;
  assigning.value = line;
}

function toggleAssignee(uid) {
  const line = assigning.value;
  if (!line) return;
  line.assignees = line.assignees.includes(uid)
    ? line.assignees.filter((x) => x !== uid)
    : [...line.assignees, uid];
}

// ── Receipt recognition ──────────────────────────
function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
}

function openPicker(input) {
  if (recognizing.value || !input) return;
  prewarmReceiptRecognition();
  input.click();
}

async function onFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  revokePreview();
  previewUrl.value = URL.createObjectURL(file);
  try {
    const receipt = await recognizeReceipt(file);
    const added = linesFromReceipt(receipt, props.people);
    draft.value.lines = [...draft.value.lines.filter((l) => !isBlankLine(l)), ...added];
    if (!draft.value.title.trim()) draft.value.title = receiptTitle(receipt).slice(0, 100);
    if (!draft.value.receiptTotal && receipt.total) draft.value.receiptTotal = receipt.total;
    success(t('expense.editor.recognized', { items: receipt.items.length, fees: receipt.fees.length }));
  } catch (e) {
    const code = e?.code || RECOGNITION_ERROR.UNKNOWN;
    error(code === RECOGNITION_ERROR.NO_CARDS
      ? t('expense.editor.noItems')
      : t(`hand.recognition.errors.${code}`));
  }
}

// ── Save / delete / close ────────────────────────
function close() {
  revokePreview();
  emit('update:modelValue', false);
}

async function requestClose() {
  if (canEdit.value && snapshot() !== initialJson) {
    if (!await confirm({ message: t('expense.editor.confirmClose'), type: 'warning' })) return;
  }
  close();
}

async function onSave() {
  if (!problems.value.ok || saving.value) return;
  saving.value = true;
  try {
    await saveExpense(props.sessionId, draft.value, pickablePeople.value);
    success(t('expense.editor.saved'));
    close();
  } catch (e) {
    error(e?.message || t('session.actionFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!draft.value.id || saving.value) return;
  if (!await confirm({ message: t('expense.editor.confirmDelete'), type: 'danger' })) return;
  saving.value = true;
  try {
    await deleteExpense(props.sessionId, draft.value.id);
    close();
  } catch (e) {
    error(e?.message || t('session.actionFailed'));
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(revokePreview);
</script>

<style scoped>
.field {
  width: 100%;
  background: rgb(var(--tw-slate-800));
  border: 1px solid rgb(var(--tw-slate-600));
  border-radius: 8px;
  padding: 6px 8px;
  color: rgb(var(--tw-white));
  font-size: 14px;
}
.field.flex-1, .field.w-24, .field.w-28 { width: auto; }
.field.w-24 { width: 6rem; }
.field.w-28 { width: 7rem; }
.field:disabled { opacity: 0.7; }
.assignee {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid;
  background: rgb(var(--tw-white) / 0.04);
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-line {
  width: 100%;
  font-size: 13px;
  padding: 8px;
  border-radius: 8px;
  border: 1px dashed rgb(var(--tw-slate-600));
  color: rgb(var(--tw-white) / 0.7);
}
.chip {
  font-size: 14px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid;
}
.chip-on {
  background: rgb(var(--tw-emerald-500) / 0.2);
  border-color: rgb(var(--tw-emerald-500));
  color: rgb(var(--tw-emerald-200));
}
.chip-off {
  background: transparent;
  border-color: rgb(var(--tw-slate-600));
  color: rgb(var(--tw-white) / 0.8);
}
</style>
