<template>
  <section class="card">
    <div class="flex items-center justify-between mb-3">
      <h2 class="section-title mb-0">{{ $t('admin.versionHistory.title') }}</h2>
      <button @click="$emit('load')" class="text-xs text-amber-400 hover:text-amber-300">
        <i class="fas fa-history mr-1"></i>{{ $t('admin.versionHistory.load') }}
      </button>
    </div>

    <div v-if="loading" class="text-center py-4 text-gray-400">
      <i class="fas fa-spinner fa-spin"></i>
    </div>

    <div v-else-if="versions.length === 0 && loaded" class="text-gray-500 text-sm text-center py-3">
      {{ $t('admin.versionHistory.empty') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="v in versions"
        :key="v.id"
        class="bg-slate-900/60 rounded-xl p-3 border border-slate-700"
      >
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-gray-300 font-semibold">{{ v.editorName }}</span>
          <span class="text-xs text-gray-500">{{ formatTimestamp(v.timestamp) }}</span>
        </div>
        <div v-if="v.reason" class="text-xs text-gray-400 italic mb-1.5">"{{ v.reason }}"</div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500">
            {{ Object.keys(v.after || {}).join(', ') }}
          </span>
          <button
            v-if="canRollback"
            @click="$emit('rollback', v)"
            class="text-xs text-amber-400 hover:text-amber-300 ml-2"
          >
            <i class="fas fa-undo mr-0.5"></i>{{ $t('admin.versionHistory.rollback') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  /** Loaded config version entries */
  versions: {
    type: Array,
    default: () => [],
  },
  /** Whether versions are currently being fetched */
  loading: {
    type: Boolean,
    default: false,
  },
  /** Whether a fetch has completed at least once (enables the empty state) */
  loaded: {
    type: Boolean,
    default: false,
  },
  /** Whether the rollback action is available */
  canRollback: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['load', 'rollback']);

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}
</script>

<style scoped>
.card {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
}
.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.75rem;
}
</style>
