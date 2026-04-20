<template>
  <div>
    <h3 class="text-sm font-bold text-gray-300 mb-3">
      <i class="fas fa-history mr-1"></i>{{ $t('transaction.log') }}
    </h3>

    <div v-if="error" class="text-center text-rose-400 text-xs py-2 mb-2">
      <i class="fas fa-exclamation-triangle mr-1"></i>{{ error }}
    </div>

    <div v-if="loading" class="text-center text-gray-500 text-sm py-4">
      <i class="fas fa-spinner fa-spin mr-1"></i>{{ $t('loading.loading') }}
    </div>

    <div v-else-if="transactions.length === 0" class="text-center text-gray-500 text-sm py-4">
      {{ $t('transaction.noRecords') }}
    </div>

    <div class="space-y-2 max-h-64 overflow-y-auto">
      <div
        v-for="tx in transactions"
        :key="tx.txId"
        class="flex items-center justify-between p-3 rounded-xl border transition-all"
        :class="tx.status === 'undone'
          ? 'bg-slate-900/50 border-slate-800 opacity-50'
          : tx.type === 'undo'
            ? 'bg-rose-950/30 border-rose-900/30'
            : tx.type === 'remove'
              ? 'bg-red-950/20 border-red-900/20'
              : ['join', 'bind', 'modify'].includes(tx.type)
                ? 'bg-slate-800/40 border-slate-700/50'
                : 'bg-slate-800/70 border-slate-700'"
      >
        <!-- Left: description -->
        <div class="flex-1 min-w-0">
          <div class="text-sm" :class="tx.status === 'undone' ? 'line-through text-gray-600' : 'text-white'">
            <template v-if="tx.type === 'undo'">
              <span class="text-rose-400">↩️</span>
              {{ tx.actionName }} {{ $t('transaction.undid') }} {{ tx.targetName }}
            </template>
            <template v-else-if="tx.type === 'join'">
              <span>👤</span>
              {{ tx.targetName }} {{ $t('transaction.joined') }}
            </template>
            <template v-else-if="tx.type === 'modify'">
              <span>✏️</span>
              {{ tx.actionName }} {{ $t('transaction.modified') }} {{ tx.targetName }}{{ $t('transaction.modifiedSuffix') }}
            </template>
            <template v-else-if="tx.type === 'remove'">
              <span>🗑️</span>
              {{ tx.actionName }} {{ $t('transaction.removed') }} {{ tx.targetName }}
            </template>
            <template v-else-if="tx.type === 'bind'">
              <span>🔗</span>
              {{ tx.actionName }} {{ $t('transaction.boundSeat') }} {{ tx.targetName }}
            </template>
            <template v-else-if="tx.actionUid === tx.targetUid || (!tx.targetUid && tx.actionName === tx.targetName)">
              {{ tx.actionName }} {{ $t('transaction.selfBuyIn') }}
            </template>
            <template v-else>
              {{ tx.actionName }} {{ $t('transaction.helpBuyIn') }} {{ tx.targetName }}
            </template>
          </div>
          <div class="text-[10px] text-gray-500 mt-1">
            {{ formatTime(tx.timestamp) }}
          </div>
        </div>

        <!-- Right: amount + undo -->
        <div class="flex items-center gap-2 ml-3">
          <span
            v-if="tx.type === 'buy_in' || tx.type === 'add_on' || tx.type === 'reentry' || tx.type === 'undo' || (tx.type === 'modify' && tx.amount)"
            class="font-mono font-bold text-sm"
            :class="tx.type === 'undo' ? 'text-rose-400' : tx.amount < 0 ? 'text-rose-400' : 'text-emerald-400'"
          >
            {{ tx.amount > 0 ? '+' : '' }}{{ formatNumber(tx.amount) }}
          </span>

          <!-- Undo button: only on active buy-in/add-on, and only if current user did it or is host -->
          <button
            v-if="tx.status === 'active' && (tx.type === 'buy_in' || tx.type === 'add_on' || tx.type === 'reentry') && canUndo(tx)"
            @click="$emit('undo', tx)"
            class="text-gray-500 hover:text-rose-400 transition text-xs px-2 py-1 rounded border border-slate-700 hover:border-rose-500"
          >
            ↩️
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useAuth } from '../../composables/useAuth.js';
import { formatNumber } from '../../utils/formatters.js';

const { t } = useI18n();
const { user } = useAuth();

const props = defineProps({
  transactions: { type: Array, default: () => [] },
  hostUid: { type: String, default: '' },
  error: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});

defineEmits(['undo']);

const canUndo = (tx) => {
  if (!user.value) return false;
  return tx.actionUid === user.value.uid || props.hostUid === user.value.uid;
};

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
};
</script>
