<template>
  <div class="min-h-screen bg-slate-900 text-white pb-nav">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.push('/lobby')" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">📋 {{ $t('template.title') }}</h1>
        <button
          @click="$router.push({ path: '/template-setup', query: { kind } })"
          class="px-3 py-1.5 rounded-lg text-sm font-semibold transition"
          :class="kind === 'cash' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'"
        >
          <i class="fas fa-plus mr-1"></i>{{ $t('template.new') }}
        </button>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-5">
      <!-- Kind tabs -->
      <div class="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl">
        <button
          v-for="k in KINDS"
          :key="k"
          type="button"
          @click="setKind(k)"
          class="py-2 rounded-lg text-sm font-semibold transition"
          :class="kind === k ? (k === 'cash' ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white') : 'text-gray-400 hover:text-white'"
        >
          {{ k === 'cash' ? '💵 ' + $t('template.kindCash') : '🏆 ' + $t('template.kindTournament') }}
        </button>
      </div>
      <p class="text-xs text-gray-400">{{ kind === 'cash' ? $t('template.kindCashDesc') : $t('template.kindTournamentDesc') }}</p>

      <section>
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('template.mine') }}</h2>
        <div v-if="loaded && mine.length === 0" class="text-center py-8 text-gray-500">
          <i class="fas fa-folder-open text-3xl mb-2 block"></i>
          <p>{{ $t('template.none') }}</p>
        </div>
        <div class="grid gap-3">
          <div v-for="tpl in mine" :key="`${tpl.source}:${tpl.id}`" @click="edit(tpl)" class="preset-card cursor-pointer">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ tpl.name || $t('cashPreset.untitled') }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">{{ summary(tpl) }}</p>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click.stop="handleDelete(tpl)"
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

      <section v-if="kind === 'tournament'">
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">{{ $t('tournament.builtInTemplates') }}</h2>
        <div class="grid gap-3">
          <div v-for="tpl in builtIns" :key="tpl.id" @click="edit(tpl)" class="preset-card cursor-pointer">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-white">{{ tpl.name }}</h3>
              <p class="text-sm text-gray-400 mt-0.5">{{ summary(tpl) }}</p>
            </div>
            <i class="fas fa-chevron-right text-gray-500 flex-shrink-0"></i>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
// 開桌範本: every table starts from one. Two kinds (cash / tournament) with
// modules on top — see utils/tableTemplates.js.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTableTemplates } from '../composables/useTableTemplates.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { TOURNAMENT_TEMPLATES } from '../utils/tournamentTemplates.js';
import { TEMPLATE_KINDS, templateFromBuiltInTournament } from '../utils/tableTemplates.js';
import { templateSummary } from '../utils/templateDisplay.js';

const KINDS = TEMPLATE_KINDS;
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { success, error: showError } = useNotification();
const { confirm } = useConfirm();
const { listenTemplates, deleteTemplate } = useTableTemplates();

const kind = ref(KINDS.includes(route.query.kind) ? route.query.kind : 'cash');
const all = ref([]);
const loaded = ref(false);
const mine = computed(() => all.value.filter((tpl) => tpl.kind === kind.value));
const builtIns = computed(() => TOURNAMENT_TEMPLATES.map((b) => templateFromBuiltInTournament(b, t)));
const summary = (tpl) => templateSummary(tpl, t);

function setKind(k) {
  kind.value = k;
  router.replace({ query: { kind: k } });
}

let unsub = null;
onMounted(() => {
  unsub = listenTemplates((list) => {
    all.value = list;
    loaded.value = true;
  });
});
onUnmounted(() => { if (unsub) unsub(); });

function edit(tpl) {
  if (tpl.builtIn) {
    router.push({ path: '/template-setup', query: { kind: 'tournament', builtin: tpl.id } });
  } else if (tpl.source === 'template') {
    router.push(`/template-setup/${tpl.id}`);
  } else {
    router.push({ path: `/template-setup/${tpl.id}`, query: { source: tpl.source } });
  }
}

async function handleDelete(tpl) {
  const ok = await confirm({
    message: t('template.confirmDelete', { name: tpl.name }),
    type: 'warning',
  });
  if (!ok) return;
  try {
    await deleteTemplate(tpl);
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
  background: rgb(var(--tw-slate-800) / 0.6);
  border: 1px solid rgb(var(--tw-white) / 0.08);
  border-radius: 0.75rem;
  padding: 1rem;
  transition: border-color 0.2s;
}
.preset-card:hover { border-color: rgb(var(--tw-amber-500) / 0.3); }
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
