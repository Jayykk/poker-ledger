<template>
  <div class="min-h-screen bg-slate-900 text-white pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
      <div class="flex items-center gap-3 max-w-2xl mx-auto">
        <button @click="$router.push('/lobby')" class="text-gray-400 hover:text-white">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h1 class="text-lg font-bold flex-1">🗂️ {{ $t('session.historyEvents') }}</h1>
      </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-4">
      <div v-if="endedSessions.length === 0" class="text-center py-12 text-gray-500">
        <i class="fas fa-inbox text-3xl mb-2 block opacity-50"></i>
        <p>{{ $t('session.noHistoryEvents') }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="evt in endedSessions"
          :key="evt.id"
          @click="$router.push(`/session/${evt.id}`)"
          class="rounded-2xl border border-slate-700 bg-slate-800/40 transition p-4 cursor-pointer active:scale-95 hover:border-opacity-60"
        >
          <div class="flex justify-between items-center">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white font-bold">{{ evt.name }}</span>
                <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-600/50 text-slate-300">
                  {{ $t('session.done') }}
                </span>
              </div>
              <div class="text-xs text-gray-400 mt-1">
                👥 {{ (evt.participantUids || []).length }} · 🗓️ {{ (evt.periods || []).length }}
                <span v-if="evt.dateTimeMs"> · {{ formatDate(evt.dateTimeMs) }}</span>
              </div>
            </div>
            <i class="fas fa-chevron-right text-gray-500"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useSessions } from '../composables/useSessions.js';
import { formatDate } from '../utils/formatters.js';

// Reuses the same host/joined listeners (and module-level cache) as the lobby,
// but shows the COMPLETED sessions the lobby now hides.
const { listenMySessions, listenJoinedSessions, myHostedSessions, myJoinedSessions } = useSessions();

const endedSessions = computed(() => {
  const byId = new Map();
  for (const s of [...myHostedSessions.value, ...myJoinedSessions.value]) byId.set(s.id, s);
  return [...byId.values()]
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.dateTimeMs || 0) - (a.dateTimeMs || 0));
});

let unsubHosted = null;
let unsubJoined = null;

onMounted(() => {
  unsubHosted = listenMySessions();
  unsubJoined = listenJoinedSessions();
});

onUnmounted(() => {
  if (unsubHosted) { unsubHosted(); unsubHosted = null; }
  if (unsubJoined) { unsubJoined(); unsubJoined = null; }
});
</script>
