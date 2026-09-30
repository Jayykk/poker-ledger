<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="goBack" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">
          {{ isEditing ? $t('structure.edit') : $t('structure.create') }}
        </h1>
        <button
          @click="handleSave"
          :disabled="saving"
          class="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-lg text-sm font-semibold transition"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-4">
      <section class="card space-y-3">
        <div>
          <label class="field-label">{{ $t('structure.name') }}</label>
          <input v-model="form.name" type="text" class="field-input" :placeholder="$t('structure.namePlaceholder')" />
        </div>
        <div>
          <label class="field-label">{{ $t('structure.cutoff') }}</label>
          <select v-model="form.cutoffLevel" class="field-input">
            <option :value="null">{{ $t('timed.noCutoff') }}</option>
            <option v-for="n in maxLevel" :key="n" :value="n">{{ $t('timed.cutoff', { level: n }) }}</option>
          </select>
          <p class="hint">{{ $t('structure.cutoffHint') }}</p>
        </div>
        <p class="hint">{{ summary }}</p>
      </section>

      <section class="card">
        <h2 class="section-title">{{ $t('tournament.blindStructure') }}</h2>
        <LevelsEditor v-model:levels="form.levels" />
      </section>
    </div>
  </div>
</template>

<script setup>
// Edit one blind structure (name, suggested cutoff, levels).
//   /structure-setup                 new
//   /structure-setup?builtin=<id>    new, copied from a built-in
//   /structure-setup/:structureId    stored structure (?source=tournamentPresets
//                                    for one still inside a legacy preset —
//                                    saving makes it a structure of its own)
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LevelsEditor from '../components/templates/LevelsEditor.vue';
import { useTableTemplates } from '../composables/useTableTemplates.js';
import { useNotification } from '../composables/useNotification.js';
import { TOURNAMENT_TEMPLATES, createBlankTournamentConfig } from '../utils/tournamentTemplates.js';
import {
  builtInStructures, maxLevelNumber, normalizeStructure, validateStructure,
} from '../utils/tableTemplates.js';
import { structureSummary } from '../utils/templateDisplay.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { listenStructures, saveStructure } = useTableTemplates();

const structureId = computed(() => route.params.structureId || null);
const source = computed(() => route.query.source || 'structure');
const isEditing = computed(() => Boolean(structureId.value));

const editable = (s) => ({
  name: s.name || '',
  cutoffLevel: s.cutoffLevel ?? null,
  levels: (s.levels || []).map((l) => ({ ...l })),
});

const form = ref(editable({ levels: createBlankTournamentConfig().levels }));
const saving = ref(false);
// Kept on save so a structure copied from a legacy preset keeps hiding it.
const migratedFrom = ref(null);
const maxLevel = computed(() => maxLevelNumber(form.value.levels));
const summary = computed(() => structureSummary(normalizeStructure(form.value), t));

// Deleting levels can leave the cutoff past the end.
watch(maxLevel, (max) => {
  if (form.value.cutoffLevel && form.value.cutoffLevel > max) form.value.cutoffLevel = null;
});

let unsub = null;
onMounted(() => {
  const builtinId = route.query.builtin;
  if (builtinId) {
    const found = builtInStructures(TOURNAMENT_TEMPLATES, t).find((s) => s.id === builtinId);
    if (found) form.value = editable(found);
  }
  if (!isEditing.value) return;
  unsub = listenStructures((list) => {
    const found = list.find((s) => s.id === structureId.value && s.source === source.value)
      || list.find((s) => s.id === structureId.value);
    if (found) {
      form.value = editable(found);
      migratedFrom.value = found.migratedFrom || null;
    }
    if (unsub) { unsub(); unsub = null; } // one read is enough
  });
});
onUnmounted(() => { if (unsub) unsub(); });

async function handleSave() {
  const errors = validateStructure(form.value);
  if (errors.length) {
    showError(t(`structure.errors.${errors[0]}`));
    return;
  }
  saving.value = true;
  try {
    await saveStructure({ ...form.value, id: structureId.value, migratedFrom: migratedFrom.value }, isEditing.value ? source.value : 'new');
    success(t('common.save') + ' ✓');
    router.push('/structures');
  } catch (e) {
    showError(e.message);
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push('/structures');
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
  letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
}
.field-label {
  display: block;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}
.field-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.9rem;
}
.field-input:focus { outline: none; border-color: #f59e0b; }
.hint { font-size: 0.75rem; color: rgba(255, 255, 255, 0.45); margin-top: 0.25rem; }
</style>
