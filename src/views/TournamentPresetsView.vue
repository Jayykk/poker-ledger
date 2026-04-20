<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.push('/lobby')" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">🏆 {{ $t('tournament.presets') }}</h1>
        <button
          @click="$router.push('/tournament-setup')"
          class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold transition"
        >
          <i class="fas fa-plus mr-1"></i>{{ $t('tournament.newPreset') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-6">
      <!-- Built-in Templates -->
      <section>
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">
          {{ $t('tournament.builtInTemplates') }}
        </h2>
        <div class="grid gap-3">
          <div
            v-for="tmpl in builtInTemplates"
            :key="tmpl.id"
            @click="editFromTemplate(tmpl)"
            class="preset-card cursor-pointer hover:border-amber-500/50 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ tmpl.name }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">
                BuyIn ${{ tmpl.buyIn }} · {{ tmpl.startingChips.toLocaleString() }} chips · {{ tmpl.levels.filter(l => !l.isBreak).length }} levels
              </p>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ tmpl.levels[0]?.duration }}min/level · 
                {{ $t('tournament.reentryUntil', { level: tmpl.reentryUntilLevel }) }}
              </p>
            </div>
            <i class="fas fa-chevron-right text-gray-500 flex-shrink-0"></i>
          </div>
        </div>
      </section>

      <!-- User Presets -->
      <section>
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">
          {{ $t('tournament.myPresets') }}
        </h2>

        <div v-if="userPresets.length === 0" class="text-center py-8 text-gray-500">
          <i class="fas fa-folder-open text-3xl mb-2 block"></i>
          <p>{{ $t('tournament.noPresets') }}</p>
        </div>

        <div class="grid gap-3">
          <div
            v-for="preset in userPresets"
            :key="preset.id"
            @click="editPreset(preset)"
            class="preset-card cursor-pointer hover:border-blue-500/50 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ preset.name || 'Untitled' }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">
                BuyIn ${{ preset.buyIn || 0 }} · {{ (preset.startingChips || 0).toLocaleString() }} chips · {{ (preset.levels || []).filter(l => !l.isBreak).length }} levels
              </p>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click.stop="handleDelete(preset)"
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
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';

const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { confirm } = useConfirm();
const { listenPresets, deletePreset } = useTournamentClock();

const builtInTemplates = TOURNAMENT_TEMPLATES;
const userPresets = ref([]);
let unsubPresets = null;

onMounted(() => {
  unsubPresets = listenPresets((presets) => {
    userPresets.value = presets;
  });
});

onUnmounted(() => {
  if (unsubPresets) unsubPresets();
});

function editFromTemplate(tmpl) {
  router.push({ path: '/tournament-setup', query: { template: tmpl.id } });
}

function editPreset(preset) {
  router.push(`/tournament-setup/${preset.id}`);
}

async function handleDelete(preset) {
  const ok = await confirm({
    message: t('tournament.confirmDelete', { name: preset.name }),
    type: 'warning',
  });
  if (!ok) return;
  try {
    await deletePreset(preset.id);
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

.preset-card:hover {
  border-color: rgba(245, 158, 11, 0.3);
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}
</style>
