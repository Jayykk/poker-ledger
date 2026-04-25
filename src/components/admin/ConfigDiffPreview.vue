<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
    @click.self="$emit('cancel')"
  >
    <div class="w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-600 overflow-hidden shadow-2xl">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 class="text-white font-bold text-base">
          <i class="fas fa-eye mr-2 text-amber-400"></i>
          {{ $t('admin.diffPreview.title') }}
        </h2>
        <button @click="$emit('cancel')" class="text-gray-400 hover:text-white">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Status warning banner -->
      <div v-if="statusWarning" class="px-5 py-3 bg-amber-600/20 border-b border-amber-600/40 flex items-center gap-2">
        <i class="fas fa-exclamation-triangle text-amber-400"></i>
        <p class="text-amber-300 text-sm">{{ $t('admin.diffPreview.activeWarning') }}</p>
      </div>

      <!-- Changes list -->
      <div class="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-2">
        <div v-if="changes.length === 0" class="text-gray-400 text-sm text-center py-4">
          {{ $t('admin.diffPreview.noChanges') }}
        </div>

        <div
          v-for="change in changes"
          :key="change.field"
          class="rounded-lg border p-3 text-sm"
          :class="change.isRisky
            ? 'border-amber-600/50 bg-amber-600/10'
            : 'border-slate-600 bg-slate-700/50'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-semibold text-white">{{ change.label }}</span>
            <span v-if="change.isRisky" class="text-[10px] text-amber-400 bg-amber-600/20 px-1.5 py-0.5 rounded">
              <i class="fas fa-exclamation-triangle mr-0.5"></i>{{ $t('admin.diffPreview.risky') }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <div class="flex-1 rounded px-2 py-1 bg-red-900/30 text-red-300 line-through break-all">
              {{ formatValue(change.before) }}
            </div>
            <i class="fas fa-arrow-right text-gray-500 flex-shrink-0"></i>
            <div class="flex-1 rounded px-2 py-1 bg-emerald-900/30 text-emerald-300 break-all">
              {{ formatValue(change.after) }}
            </div>
          </div>
          <p v-if="change.hint" class="text-[11px] text-gray-400 mt-1.5">{{ change.hint }}</p>
        </div>
      </div>

      <!-- Reason input -->
      <div class="px-5 py-3 border-t border-slate-700">
        <label class="block text-xs text-gray-400 mb-1">{{ $t('admin.diffPreview.reason') }}</label>
        <input
          v-model="localReason"
          type="text"
          class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          :placeholder="$t('admin.diffPreview.reasonPlaceholder')"
        />
      </div>

      <!-- Action buttons -->
      <div class="px-5 py-4 border-t border-slate-700 flex gap-3">
        <button
          @click="$emit('cancel')"
          class="flex-1 py-2.5 rounded-xl border border-slate-600 text-gray-300 text-sm font-semibold hover:bg-slate-700 transition"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          @click="handleConfirm"
          :disabled="changes.length === 0"
          class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
          :class="changes.length === 0
            ? 'bg-slate-600 text-gray-500 cursor-not-allowed'
            : statusWarning
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'"
        >
          <i class="fas fa-save mr-1.5"></i>{{ $t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  /** Array of { field, label, before, after, isRisky, hint } */
  changes: {
    type: Array,
    default: () => [],
  },
  /** Whether the item is currently active/running (triggers warning banner) */
  statusWarning: {
    type: Boolean,
    default: false,
  },
  /** Pre-filled reason text */
  reason: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['confirm', 'cancel']);

const localReason = ref(props.reason);

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? t('common.yes') : t('common.no');
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 80);
  return String(val);
}

function handleConfirm() {
  emit('confirm', localReason.value);
}
</script>
