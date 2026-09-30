<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.push('/lobby')" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">🏆 {{ $t('structure.title') }}</h1>
        <button
          @click="$router.push('/structure-setup')"
          class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold transition"
        >
          <i class="fas fa-plus mr-1"></i>{{ $t('structure.new') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-6">
      <p class="text-xs text-gray-400">{{ $t('structure.intro') }}</p>

      <!-- Mine -->
      <section>
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('structure.mine') }}</h2>
        <div v-if="loaded && mine.length === 0" class="text-center py-8 text-gray-500">
          <i class="fas fa-folder-open text-3xl mb-2 block"></i>
          <p>{{ $t('structure.none') }}</p>
        </div>
        <div class="grid gap-3">
          <div
            v-for="s in mine"
            :key="`${s.source}:${s.id}`"
            @click="edit(s)"
            class="preset-card cursor-pointer"
          >
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ s.name || $t('cashPreset.untitled') }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">{{ summary(s) }}</p>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click.stop="handleDelete(s)"
                class="action-btn bg-red-600/30 hover:bg-red-500 text-red-400 hover:text-white"
                :title="$t('common.delete')"
              >
                <i class="fas fa-trash-alt"></i>
              </button>
              <i class="fas fa-chevron-right text-gray-500"></i>
            </div>
          </div>
        </div>
      </section>

      <!-- Built-in -->
      <section>
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('tournament.builtInTemplates') }}</h2>
        <div class="grid gap-3">
          <div
            v-for="s in builtIns"
            :key="s.id"
            @click="edit(s)"
            class="preset-card cursor-pointer"
          >
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ s.name }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">{{ summary(s) }}</p>
            </div>
            <i class="fas fa-chevron-right text-gray-500 flex-shrink-0"></i>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
// 賽制設定: the blind-structure library (levels only). Buy-in, re-entry and
// payouts live on table templates (TableTemplatesView).
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTableTemplates } from '../composables/useTableTemplates.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { builtInStructures } from '../utils/tableTemplates.js';
import { structureSummary } from '../utils/templateDisplay.js';

const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { confirm } = useConfirm();
const { listenStructures, deleteStructure } = useTableTemplates();

const mine = ref([]);
const loaded = ref(false);
const builtIns = computed(() => builtInStructures(TOURNAMENT_TEMPLATES, t));
const summary = (s) => structureSummary(s, t);

let unsub = null;
onMounted(() => {
  unsub = listenStructures((list) => {
    mine.value = list;
    loaded.value = true;
  });
});
onUnmounted(() => { if (unsub) unsub(); });

function edit(s) {
  if (s.source === 'builtin') {
    router.push({ path: '/structure-setup', query: { builtin: s.id } });
  } else if (s.source === 'structure') {
    router.push(`/structure-setup/${s.id}`);
  } else {
    router.push({ path: `/structure-setup/${s.id}`, query: { source: s.source } });
  }
}

async function handleDelete(s) {
  const ok = await confirm({
    message: t('structure.confirmDelete', { name: s.name }),
    type: 'warning',
  });
  if (!ok) return;
  try {
    await deleteStructure(s);
    success(t('common.delete') + ' ✓');
  } catch (e) {
    showError(e.message);
  }
}
</script>

<style scoped>
.preset-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
  transition: border-color 0.2s;
}
.preset-card:hover { border-color: rgba(245, 158, 11, 0.3); }
.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}
</style>
