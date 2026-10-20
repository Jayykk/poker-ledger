<template>
  <section class="expenses">
    <h3>💸 {{ t('expense.title') }}</h3>
    <p class="muted hint">{{ t('expense.hint') }}</p>

    <div v-if="!expenses.length" class="muted empty">{{ t('expense.empty') }}</div>
    <button
      v-for="e in expenses"
      :key="e.id"
      type="button"
      class="exp-card"
      @click="openEditor(e)"
    >
      <div class="exp-main">
        <span class="exp-title">{{ e.title || t('expense.title') }}</span>
        <span class="exp-payer">{{ t('expense.paidBy', { name: nameOf(e, e.payerUid) }) }}</span>
      </div>
      <span class="exp-sum">{{ collectText(e) }}</span>
    </button>

    <button type="button" class="btn-add" @click="openEditor(null)">＋ {{ t('expense.add') }}</button>

    <!-- Running balances -->
    <div v-if="balances.length" class="balances">
      <div class="bal-head">
        <span>{{ t('expense.netTitle') }}</span>
        <span class="muted small">{{ t('expense.netHint') }}</span>
      </div>
      <div v-for="r in balances" :key="r.uid" class="bal-row" :class="{ mine: r.uid === myUid }">
        <span>{{ r.name || '—' }}<template v-if="r.uid === myUid">（{{ t('expense.me') }}）</template></span>
        <span class="bal-amt" :class="r.net >= 0 ? 'pos' : 'neg'">{{ r.net >= 0 ? '+' : '' }}{{ r.net }}</span>
      </div>
    </div>

    <ExpenseEditor
      v-model="editorOpen"
      :session-id="sessionId"
      :expense="editing"
      :people="people"
      :is-host="isHost"
    />
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../store/modules/auth.js';
import { expenseDebts, aggregateExpenses } from '../../utils/eventExpenses.js';
import ExpenseEditor from './ExpenseEditor.vue';

const props = defineProps({
  sessionId: { type: String, required: true },
  /** Live list from useEventExpenses (the parent owns the listener). */
  expenses: { type: Array, default: () => [] },
  people: { type: Array, default: () => [] },
  isHost: { type: Boolean, default: false },
});

const { t } = useI18n();
const authStore = useAuthStore();
const myUid = computed(() => authStore.user?.uid || null);

const editorOpen = ref(false);
const editing = ref(null);

const balances = computed(() => aggregateExpenses(props.expenses));

function openEditor(e) {
  editing.value = e;
  editorOpen.value = true;
}

function nameOf(e, uid) {
  return e.names?.[uid] || props.people.find((p) => p.uid === uid)?.name || e.payerName || '—';
}

function collectText(e) {
  const debts = expenseDebts(e);
  if (!debts.length) return t('expense.nothingCharged');
  const amount = debts.reduce((s, d) => s + d.amount, 0);
  return t('expense.collect', { count: debts.length, amount });
}
</script>

<style scoped>
.expenses h3 {
  font-size: 16px; margin: 18px 0 4px;
  border-top: 1px solid rgb(var(--tw-white) / 0.1); padding-top: 14px;
}
.muted { color: rgb(var(--tw-white) / 0.45); }
.small { font-size: 11px; }
.hint { font-size: 12px; margin: 0 0 10px; }
.empty { font-size: 13px; margin-bottom: 10px; }
.exp-card {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  text-align: left; padding: 12px; margin-bottom: 8px; cursor: pointer;
  background: rgb(var(--tw-white) / 0.04); border: 1px solid rgb(var(--tw-white) / 0.1);
  border-radius: 10px; color: inherit; font-weight: normal;
}
.exp-main { display: flex; flex-direction: column; min-width: 0; }
.exp-title { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-payer { font-size: 12px; color: rgb(var(--tw-white) / 0.55); }
.exp-sum { flex: 0 0 auto; font-size: 13px; color: rgb(var(--tw-amber-300)); }
.btn-add {
  width: 100%; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer;
  background: rgb(var(--tw-white) / 0.06); border: 1px dashed rgb(var(--tw-white) / 0.25);
  color: rgb(var(--tw-white) / 0.85);
}
.balances {
  margin-top: 12px; padding: 10px 12px; border-radius: 10px;
  background: rgb(var(--tw-white) / 0.04); border: 1px solid rgb(var(--tw-white) / 0.08);
}
.bal-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; font-weight: bold; margin-bottom: 6px; }
.bal-row { display: flex; justify-content: space-between; font-size: 14px; padding: 3px 0; }
.bal-row.mine { font-weight: bold; }
.bal-amt.pos { color: rgb(var(--tw-emerald-500)); }
.bal-amt.neg { color: rgb(var(--tw-rose-400)); }
</style>
