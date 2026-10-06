<template>
  <div class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
    <div class="flex items-center gap-2 mb-1">
      <button type="button" class="tv-back" :aria-label="$t('common.back')" @click="$router.push('/profile')">
        <i class="fas fa-chevron-left"></i>
      </button>
      <h2 class="text-2xl font-bold text-white">{{ $t('titles.codex') }}</h2>
    </div>
    <p class="text-xs text-gray-400 mb-3">{{ $t('titles.codexSub') }}</p>
    <!-- Titles held and the 頭像框 they give -->
    <div class="flex items-center gap-3 mb-5">
      <PlayerAvatar size="md" :src="user?.photoURL || ''" :name="displayName || ''" :frame="myFrame" />
      <div class="min-w-0">
        <div class="text-sm font-bold text-white">
          {{ $t('titles.titleCount', { n: myTitleCount }) }}
          <span class="text-gray-400 font-normal">· {{ myFrame ? $t(`titles.frames.${myFrame}`) : $t('titles.frameNone') }}</span>
        </div>
        <div class="text-xs text-amber-400">{{ $t('titles.unlockedCount', { n: unlockedCount, total: TITLE_FAMILIES.length }) }}</div>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
    </div>

    <template v-else>
      <section v-for="group in groups" :key="group.id" class="mb-6">
        <h3 class="text-sm font-bold text-gray-300 mb-2">{{ $t(`titles.groups.${group.id}`) }}</h3>
        <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <div v-for="card in group.cards" :key="card.id" class="tv-card" :class="{ locked: !card.tier }">
            <div class="flex items-center justify-between gap-2 min-w-0">
              <TitleBadge v-if="card.tier" :family-id="card.id" :tier="card.tier" />
              <span v-else class="tv-locked">
                <i class="fas fa-lock mr-1"></i>{{ card.secret ? $t('titles.hiddenName') : $t('titles.locked') }}
              </span>
              <span v-if="card.tier" class="text-[10px] text-gray-400 flex-shrink-0">{{ $t(`titles.rarity.${titleRarity(card.tier)}`) }}</span>
            </div>

            <!-- Hidden and still locked: only the riddle -->
            <p v-if="card.secret" class="tv-hint">🔮 {{ $t(card.hintKey) }}</p>
            <template v-else>
              <p class="tv-desc">{{ $t(card.descKey) }}</p>
              <div class="tv-bar"><div class="tv-fill" :class="titleRarity(card.progress.next?.tier || card.tier)" :style="{ width: `${Math.round(card.progress.ratio * 100)}%` }"></div></div>
              <div class="flex justify-between gap-2 text-[11px] mt-1">
                <span class="text-gray-300 font-mono">
                  {{ formatValue(card.id, card.progress.value) }}<template v-if="card.progress.next"> / {{ formatValue(card.id, card.progress.next.threshold) }}</template>
                </span>
                <span class="text-gray-400 truncate">
                  {{ card.progress.next ? $t('titles.next', { name: $t(card.progress.next.nameKey) }) : $t('titles.maxed') }}
                </span>
              </div>
              <!-- Every step of the family -->
              <div class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="step in card.steps"
                  :key="step.tier"
                  class="tv-step"
                  :class="[titleRarity(step.tier), { reached: step.tier <= card.tier }]"
                >{{ $t(step.nameKey) }} · {{ formatValue(card.id, step.threshold) }}</span>
              </div>
            </template>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
// 稱號圖鑑: every title family by 系列, the tier you hold, progress to the next
// one (from your all-time leaderboardStats), hidden ones as ??? + a riddle.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuth } from '../composables/useAuth.js';
import { useUserTitles } from '../composables/useUserTitles.js';
import TitleBadge from '../components/common/TitleBadge.vue';
import PlayerAvatar from '../components/common/PlayerAvatar.vue';
import { formatNumber } from '../utils/formatters.js';
import {
  TITLE_FAMILIES, TITLE_GROUPS, nextTierProgress, titleRarity, titleCount,
} from '../utils/titles.js';
import { statsDocId } from '../../functions/src/utils/leaderboardStatsMath.js';

const { user, displayName } = useAuth();
const { titles, watchMyTitles } = useUserTitles();

const stats = ref(null);
const loading = ref(true);
let stopWatch = () => {};

const unlocked = computed(() => titles[user.value?.uid]?.unlocked || {});
const unlockedCount = computed(() => TITLE_FAMILIES.filter((f) => unlocked.value[f.id]).length);
// 頭像框: every step reached is one title; the frame shown comes from the display
const myTitleCount = computed(() => titleCount(unlocked.value));
const myFrame = computed(() => titles[user.value?.uid]?.display?.frame || null);

const groups = computed(() => TITLE_GROUPS.map((id) => ({
  id,
  cards: TITLE_FAMILIES.filter((f) => f.group === id).map((f) => {
    const held = unlocked.value[f.id]?.tier || 0;
    const progress = nextTierProgress(f, stats.value, held);
    const tier = progress.tier;
    return {
      id: f.id,
      tier,
      secret: f.hidden && !tier,
      hintKey: f.hintKey,
      descKey: f.descKey,
      progress,
      steps: f.tiers.filter((step) => !f.hidden || step.tier <= tier),
    };
  }),
})));

// Money families show as amounts, σ with decimals, the rest as counts
function formatValue(familyId, value) {
  if (familyId === 'volatile') return Number(value || 0).toFixed(1);
  if (familyId === 'bigWin' || familyId === 'bigLoss') return `${formatNumber(Math.round((value || 0) * 10) / 10)}`;
  return formatNumber(Math.round(value || 0));
}

// The signed-in user can arrive after mount (page reload)
watch(() => user.value?.uid, async (uid) => {
  stopWatch();
  stopWatch = () => {};
  if (!uid) return;
  loading.value = true;
  stopWatch = watchMyTitles(uid);
  try {
    const snap = await getDoc(doc(db, 'leaderboardStats', statsDocId(uid, 'all')));
    stats.value = snap.exists() ? snap.data() : null;
  } catch (error) {
    console.warn('[titles] stats load failed', error?.code || error);
  } finally {
    loading.value = false;
  }
}, { immediate: true });

onBeforeUnmount(() => stopWatch());
</script>

<style scoped>
.tv-back { width: 2rem; height: 2rem; border-radius: 0.5rem; color: rgb(var(--tw-slate-300)); }
.tv-card {
  padding: 0.75rem;
  border-radius: 0.8rem;
  border: 1px solid rgb(var(--tw-slate-700));
  background: rgb(var(--tw-slate-800));
  min-width: 0;
}
.tv-card.locked { background: rgb(var(--tw-slate-800) / 0.6); }
.tv-locked { font-size: 0.7rem; font-weight: 700; color: rgb(var(--tw-slate-400)); }
.tv-desc { font-size: 0.75rem; color: rgb(var(--tw-slate-300)); margin-top: 0.45rem; }
.tv-hint { font-size: 0.75rem; color: rgb(var(--tw-slate-300)); margin-top: 0.45rem; font-style: italic; }
.tv-bar { height: 0.4rem; border-radius: 999px; background: rgb(var(--tw-slate-700)); margin-top: 0.5rem; overflow: hidden; }
.tv-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
.tv-fill.common { background: #94a3b8; }
.tv-fill.rare { background: #3b82f6; }
.tv-fill.epic { background: #a855f7; }
.tv-fill.legendary { background: linear-gradient(90deg, #f59e0b, #fde047); }
.tv-step {
  font-size: 0.62rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  border: 1px dashed rgb(var(--tw-slate-600));
  color: rgb(var(--tw-slate-400));
  white-space: nowrap;
}
.tv-step.reached { border-style: solid; font-weight: 700; }
.tv-step.reached.common { color: #cbd5e1; border-color: rgba(148, 163, 184, 0.5); }
.tv-step.reached.rare { color: #93c5fd; border-color: rgba(59, 130, 246, 0.6); }
.tv-step.reached.epic { color: #d8b4fe; border-color: rgba(168, 85, 247, 0.6); }
.tv-step.reached.legendary { color: #fde68a; border-color: rgba(251, 191, 36, 0.7); }
:root[data-mode="light"] .tv-step.reached.common { color: #475569; }
:root[data-mode="light"] .tv-step.reached.rare { color: #1d4ed8; }
:root[data-mode="light"] .tv-step.reached.epic { color: #7e22ce; }
:root[data-mode="light"] .tv-step.reached.legendary { color: #92400e; }
</style>
