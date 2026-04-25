<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.push('/lobby')" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">{{ $t('admin.management.title') }}</h1>
        <span
          v-if="isAdmin"
          class="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-semibold"
        >
          {{ $t('admin.management.adminBadge') }}
        </span>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4 space-y-6">

      <!-- Loading -->
      <div v-if="!permissionsLoaded || loadingData" class="text-center py-12">
        <i class="fas fa-spinner fa-spin text-2xl text-amber-400"></i>
      </div>

      <template v-else>
        <!-- Tabs -->
        <div class="flex gap-2 bg-slate-800 p-1 rounded-xl">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            class="flex-1 py-2 rounded-lg text-sm font-semibold transition"
            :class="activeTab === tab.key ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Cash Games list -->
        <template v-if="activeTab === 'cash'">
          <div v-if="filteredGames.length === 0" class="text-center py-10 text-gray-500">
            <i class="fas fa-table text-3xl mb-3 block"></i>
            {{ $t('admin.management.noGames') }}
          </div>
          <div class="space-y-3">
            <div
              v-for="room in filteredGames"
              :key="room.id"
              class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-white font-bold truncate">#{{ room.id.slice(0, 8) }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 bg-slate-600/40 text-slate-200">
                      {{ $t('lobby.liveLabel') }}
                    </span>
                    <StatusBadge :status="room.status" />
                  </div>
                  <div class="text-xs text-gray-400">
                    {{ $t('lobby.hostName') }}: {{ room.meta?.createdBy?.slice(0, 10) || $t('common.unknown') }}
                  </div>
                  <div v-if="room.meta?.blinds" class="text-xs text-gray-500 mt-0.5">
                    {{ $t('lobby.blinds') }}: {{ room.meta.blinds.small }}/{{ room.meta.blinds.big }}
                  </div>
                </div>
                <button
                  @click="$router.push(`/admin/cash/${room.id}`)"
                  class="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-semibold text-white transition"
                >
                  <i class="fas fa-edit mr-1"></i>{{ $t('common.edit') }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Tournament sessions list -->
        <template v-else>
          <div v-if="filteredSessions.length === 0" class="text-center py-10 text-gray-500">
            <i class="fas fa-trophy text-3xl mb-3 block"></i>
            {{ $t('admin.management.noTournaments') }}
          </div>
          <div class="space-y-3">
            <div
              v-for="session in filteredSessions"
              :key="session.id"
              class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-white font-bold truncate">{{ session.config?.name || session.name || '—' }}</span>
                    <StatusBadge :status="session.state?.status" />
                  </div>
                  <div class="text-xs text-gray-400">
                    {{ $t('lobby.hostName') }}: {{ session.hostName || $t('common.unknown') }}
                  </div>
                  <div v-if="session.config?.subtitle" class="text-xs text-gray-500 mt-0.5 truncate">
                    {{ session.config.subtitle }}
                  </div>
                </div>
                <button
                  @click="$router.push(`/admin/tournament/${session.id}`)"
                  class="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-semibold text-white transition"
                >
                  <i class="fas fa-edit mr-1"></i>{{ $t('common.edit') }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuthStore } from '../../store/modules/auth.js';
import { useTablePermissions } from '../../composables/useTablePermissions.js';
import StatusBadge from '../../components/admin/StatusBadge.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const { isAdmin, permissionsLoaded, loadPermissions, canEdit } = useTablePermissions();

const activeTab = ref('cash');
const loadingData = ref(false);
const games = ref([]);
const sessions = ref([]);

const tabs = computed(() => [
  { key: 'cash', label: t('admin.management.tabCash') },
  { key: 'tournament', label: t('admin.management.tabTournament') },
]);

const filteredGames = computed(() =>
  games.value.filter((g) => canEdit(g))
);

const filteredSessions = computed(() =>
  sessions.value.filter((s) => canEdit(s))
);

async function loadData() {
  loadingData.value = true;
  try {
    const uid = authStore.user?.uid;
    if (!uid) return;

    if (isAdmin.value) {
      // Admin: load all pokerGames and tournament sessions.
      // NOTE: orderBy('meta.createdAt') on a nested field may require a manual Firestore
      // single-field index for the pokerGames collection. If the query fails, remove the
      // orderBy clause or create the index in the Firebase console.
      const [gSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'pokerGames'), orderBy('meta.createdAt', 'desc'))),
        getDocs(query(collection(db, 'tournamentSessions'), orderBy('createdAt', 'desc'))),
      ]);
      games.value = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      sessions.value = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      // Host: load own pokerGames using the old schema field meta.createdBy.
      // Single equality filter on a nested field is auto-indexed by Firestore.
      const [gSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'pokerGames'), where('meta.createdBy', '==', uid))),
        getDocs(query(collection(db, 'tournamentSessions'), where('hostUid', '==', uid), orderBy('createdAt', 'desc'))),
      ]);
      games.value = gSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      sessions.value = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    console.error('loadData error:', e);
  } finally {
    loadingData.value = false;
  }
}

onMounted(async () => {
  await loadPermissions();
  await loadData();
});
</script>
