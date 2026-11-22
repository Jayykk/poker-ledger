<template>
  <section class="expenses">
    <!-- Title and the add button share the top row, so adding is one tap away
         however long the list below gets -->
    <div class="exp-head">
      <h3><i class="fas fa-receipt" aria-hidden="true"></i>{{ t('expense.title') }}</h3>
      <button type="button" class="btn-add" data-test="add-expense" @click="openEditor(null)">
        <i class="fas fa-plus" aria-hidden="true"></i><span>{{ t('expense.add') }}</span>
      </button>
    </div>
    <p class="muted hint">{{ t('expense.hint') }}</p>

    <div v-if="!expenses.length" class="muted empty">{{ t('expense.empty') }}</div>
    <button
      v-for="e in expenses"
      :key="e.id"
      type="button"
      class="exp-card"
      @click="openEditor(e)"
    >
      <span class="exp-main">
        <span class="exp-title">{{ e.title || t('expense.title') }}</span>
        <span class="exp-payer">{{ t('expense.paidBy', { name: nameOf(e, e.payerUid) }) }}</span>
      </span>
      <span class="exp-sum">{{ collectText(e) }}</span>
      <i class="fas fa-chevron-right exp-go" aria-hidden="true"></i>
    </button>

    <!-- Running balances -->
    <div v-if="balances.length" class="balances">
      <div class="bal-head">
        <span>{{ t('expense.netTitle') }}</span>
        <span class="muted small">{{ t('expense.netHint') }}</span>
      </div>
      <div v-for="r in balances" :key="r.uid" class="bal-row" :class="{ mine: r.uid === myUid }">
        <span class="bal-name">{{ r.name || '—' }}<template v-if="r.uid === myUid">（{{ t('expense.me') }}）</template></span>
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
.exp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.exp-head h3 { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; font-size: 15px; font-weight: 800; }
.exp-head h3 i { color: rgb(var(--tw-amber-400)); font-size: 14px; }
.muted { color: rgb(var(--tw-white) / 0.5); }
.small { font-size: 11px; }
.hint { font-size: 12px; margin: 0 0 12px; }
.empty { font-size: 13px; padding: 14px 0; text-align: center; border: 1px dashed rgb(var(--tw-white) / 0.14); border-radius: 12px; }
.btn-add {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px;
  border: none; border-radius: 10px; font-weight: 700; font-size: 13px; white-space: nowrap; cursor: pointer;
  background: rgb(var(--tw-amber-500)); color: var(--on-accent, #fff);
}
.btn-add i { font-size: 11px; }
.exp-card {
  width: 100%; display: flex; align-items: center; gap: 10px;
  text-align: left; padding: 12px; margin-bottom: 8px; cursor: pointer;
  background: rgb(var(--tw-white) / 0.04); border: 1px solid rgb(var(--tw-white) / 0.1);
  border-radius: 12px; color: inherit; font-weight: normal; font-size: 14px;
}
.exp-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; }
.exp-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-payer { font-size: 12px; color: rgb(var(--tw-white) / 0.55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-sum { flex: 0 0 auto; font-size: 13px; font-weight: 700; white-space: nowrap; color: rgb(var(--tw-amber-300)); }
.exp-go { flex: 0 0 auto; font-size: 11px; color: rgb(var(--tw-white) / 0.3); }
.balances {
  margin-top: 12px; padding: 10px 12px; border-radius: 12px;
  background: rgb(var(--tw-white) / 0.04); border: 1px solid rgb(var(--tw-white) / 0.08);
}
.bal-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 2px 10px; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.bal-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; padding: 4px 0; }
.bal-row.mine { font-weight: 700; }
.bal-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bal-amt { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.bal-amt.pos { color: rgb(var(--tw-emerald-400)); }
.bal-amt.neg { color: rgb(var(--tw-rose-400)); }
</style>
