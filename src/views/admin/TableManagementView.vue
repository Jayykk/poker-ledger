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
              :key="room._key"
              class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-white font-bold truncate">{{ room.displayName }}</span>
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                      :class="room.displayType === 'online'
                        ? 'bg-purple-600/40 text-purple-200'
                        : 'bg-slate-600/40 text-slate-200'"
                    >
                      {{ room.displayType === 'online' ? $t('lobby.onlineLabel') : $t('lobby.liveLabel') }}
                    </span>
                    <StatusBadge :status="room.displayStatus" />
                  </div>
                  <div class="text-xs text-gray-400">
                    {{ $t('lobby.hostName') }}: {{ room.displayHostName }}
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5">
                    {{ $t('lobby.roomCode') }}: {{ room.displayRoomCode }}
                  </div>
                </div>
                <button
                  @click="$router.push(`/admin/cash/${room.id}?src=${room._collection}`)"
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

/**
 * Normalize a `pokerGames` document into a common display shape.
 * Old pokerGames have no top-level `name` / `hostName`; derive them from `meta`.
 */
function normalizePokerGame(raw) {
  const meta = raw.meta || {};
  const blinds = meta.blinds || {};
  const sb = blinds.small ?? '?';
  const bb = blinds.big ?? '?';
  return {
    // Keep original id and raw data for editing
    id: raw.id,
    _collection: 'pokerGames',
    _key: `pokerGames-${raw.id}`,
    _raw: raw,
    // Normalized display fields
    displayName: meta.name || `${sb}/${bb} Cash`,
    displayHostName: raw.hostName || meta.hostName || t('common.unknown'),
    displayStatus: raw.status || 'unknown',
    displayType: 'online',
    displayRoomCode: raw.id.slice(0, 8).toUpperCase(),
  };
}

/**
 * Normalize a `games` (ledger) document into the same display shape.
 */
function normalizeGame(raw) {
  return {
    id: raw.id,
    _collection: 'games',
    _key: `games-${raw.id}`,
    _raw: raw,
    displayName: raw.name || t('common.unknown'),
    displayHostName: raw.hostName || t('common.unknown'),
    displayStatus: raw.status || 'unknown',
    displayType: raw.type || 'live',
    displayRoomCode: raw.roomCode || raw.id.slice(0, 8).toUpperCase(),
  };
}

const filteredGames = computed(() =>
  games.value.filter((g) => canEdit(g._raw))
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
      // Admin: load all from both collections
      const [pgSnap, gSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'pokerGames'), orderBy('meta.createdAt', 'desc'))).catch((err) => {
          console.warn('[TableManagement] pokerGames orderBy failed, retrying without sort:', err.message);
          return getDocs(collection(db, 'pokerGames'));
        }),
        getDocs(query(collection(db, 'games'), orderBy('createdAt', 'desc'))).catch((err) => {
          console.warn('[TableManagement] games orderBy failed, retrying without sort:', err.message);
          return getDocs(collection(db, 'games'));
        }),
        getDocs(query(collection(db, 'tournamentSessions'), orderBy('createdAt', 'desc'))),
      ]);
      const pokerGames = pgSnap.docs.map((d) => normalizePokerGame({ id: d.id, ...d.data() }));
      const ledgerGames = gSnap.docs.map((d) => normalizeGame({ id: d.id, ...d.data() }));
      // pokerGames listed first (primary source), then ledger games
      games.value = [...pokerGames, ...ledgerGames];
      sessions.value = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      // Host: load own items from both collections
      // Note: pokerGames uses meta.createdBy; games uses hostUid
      const [pgSnap, gSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, 'pokerGames'), where('meta.createdBy', '==', uid))).catch((err) => {
          console.warn('[TableManagement] pokerGames host query failed:', err.message);
          return { docs: [] };
        }),
        getDocs(query(collection(db, 'games'), where('hostUid', '==', uid), orderBy('createdAt', 'desc'))).catch(
          (err) => {
            console.warn('[TableManagement] games orderBy failed, retrying without sort:', err.message);
            return getDocs(query(collection(db, 'games'), where('hostUid', '==', uid)));
          }
        ),
        getDocs(
          query(collection(db, 'tournamentSessions'), where('hostUid', '==', uid), orderBy('createdAt', 'desc'))
        ),
      ]);
      const pokerGames = pgSnap.docs.map((d) => normalizePokerGame({ id: d.id, ...d.data() }));
      const ledgerGames = gSnap.docs.map((d) => normalizeGame({ id: d.id, ...d.data() }));
      // Sort pokerGames by createdAt desc (client-side, since we skipped orderBy to avoid index)
      pokerGames.sort((a, b) => {
        const ta = a._raw.meta?.createdAt?.toMillis?.() ?? 0;
        const tb = b._raw.meta?.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      games.value = [...pokerGames, ...ledgerGames];
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
