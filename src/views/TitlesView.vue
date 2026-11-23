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
    <div class="flex items-center gap-3 mb-3">
      <PlayerAvatar size="md" :src="user?.photoURL || ''" :name="displayName || ''" :frame="myFrame" />
      <div class="min-w-0">
        <div class="text-sm font-bold text-white">
          {{ $t('titles.titleCount', { n: myTitleCount }) }}
          <span class="text-gray-400 font-normal">· {{ myFrame ? $t(`titles.frames.${myFrame}`) : $t('titles.frameNone') }}</span>
        </div>
        <div class="text-xs text-amber-400">{{ $t('titles.unlockedCount', { n: myTitleCount, total: totalTitleSteps }) }}</div>
      </div>
    </div>
    <!-- 稱號 (王座 + every family) | 頭像框 (every frame) -->
    <div class="tv-tabs" role="tablist" data-testid="codex-tabs">
      <button
        v-for="tab in TABS"
        :key="tab"
        type="button"
        role="tab"
        class="tv-tab"
        :class="{ active: activeTab === tab }"
        :aria-selected="activeTab === tab"
        :data-tab="tab"
        @click="setTab(tab)"
      >
        {{ $t(`titles.codexDetail.tabs.${tab}`) }}
        <span class="tv-tab-count">{{ tab === 'frames' ? `${framesEarned} / ${framesTotal}` : `${myTitleCount} / ${totalTitleSteps}` }}</span>
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
    </div>

    <template v-else-if="activeTab === 'titles'">
      <!-- 本月王座: worn this month (won last month) and this month's race, in my 牌友圈 -->
      <section class="mb-6" data-testid="throne">
        <div class="flex items-baseline justify-between gap-2 mb-2 min-w-0">
          <h3 class="text-sm font-bold text-gray-300 flex-shrink-0">
            <i class="fas fa-crown text-amber-400 mr-1" aria-hidden="true"></i>{{ $t('titles.throne.title') }}
          </h3>
          <span class="text-[11px] text-gray-400 truncate">{{ $t('titles.throne.sub', { month: crownMonth, n: myPals.length }) }}</span>
        </div>
        <p class="text-[11px] text-gray-400 mb-2">{{ $t('titles.throne.rule') }}</p>
        <!-- Too few pals to compete yet (someone new) -->
        <p v-if="myPals.length < CROWN_MIN_PALS" class="tv-card text-xs text-gray-300" data-testid="throne-need-pals">
          {{ $t('titles.throne.needPals', { n: CROWN_MIN_PALS - myPals.length }) }}
        </p>
        <div v-else class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="row in throne"
            :key="row.id"
            class="tv-card tv-throne tv-tap"
            :class="{ held: row.wearing.includes(user?.uid) }"
            :data-crown="row.id"
            role="button"
            tabindex="0"
            @click="openDetail('crown', row.id)"
            @keydown.enter="openDetail('crown', row.id)"
          >
            <div class="flex items-center justify-between gap-2 min-w-0">
              <TitleBadge :family-id="row.id" :tier="CROWN_TIER" />
              <span class="text-[10px] text-gray-400 flex-shrink-0">{{ $t('titles.throne.history', { n: row.history }) }}</span>
            </div>
            <p class="tv-desc">{{ $t(`titles.families.${row.id}.desc`) }}</p>

            <!-- Worn this month: last month's final holders -->
            <div class="tv-row" data-testid="throne-reigning">
              <span class="tv-row-label">{{ $t('titles.throne.reigning') }}</span>
              <template v-if="row.wearing.length">
                <span class="tv-stack">
                  <PlayerAvatar
                    v-for="uid in row.wearing.slice(0, 3)"
                    :key="uid"
                    size="sm"
                    :uid="uid"
                    :src="uid === user?.uid ? (user?.photoURL || '') : ''"
                    :name="nameOf(uid)"
                    :crown="false"
                  />
                  <span v-if="row.wearing.length > 3" class="tv-more">+{{ row.wearing.length - 3 }}</span>
                </span>
                <span class="tv-reigning">{{ row.wearing.map(nameOf).join(' · ') }}</span>
              </template>
              <span v-else class="tv-vacant">{{ $t('titles.throne.vacant') }}</span>
            </div>

            <!-- This month's race: ties share the lead, so maybe several -->
            <div class="tv-row">
              <span class="tv-row-label">{{ $t('titles.throne.racing') }}</span>
              <template v-if="row.holders.length">
                <span class="tv-holders">{{ row.holders.map(nameOf).join(' · ') }}</span>
                <span v-if="!row.private" class="tv-value">{{ formatCrown(row.id, row.value) }}</span>
              </template>
              <span v-else class="tv-vacant">{{ $t('titles.throne.vacant') }}</span>
            </div>

            <!-- Me against the leader (money crowns show no amounts: who won or
                 lost how much this month isn't for the whole circle to read) -->
            <div v-if="!row.private || row.mine" class="tv-me">
              <template v-if="row.mine">
                <i class="fas fa-crown text-amber-400 mr-1" aria-hidden="true"></i>{{ row.holders.length > 1 ? $t('titles.throne.youShare') : $t('titles.throne.youHold') }}
              </template>
              <template v-else-if="row.myValue == null">
                {{ row.playedThisMonth ? $t('titles.throne.bossNeed', { n: CROWN_MIN_GROUP_GAMES }) : $t('titles.throne.noGames') }}
              </template>
              <template v-else-if="row.holders.length">
                {{ $t('titles.throne.mine', { value: formatCrown(row.id, row.myValue) }) }} · {{ $t('titles.throne.gap', { value: formatCrown(row.id, row.gap) }) }}
              </template>
              <template v-else>{{ $t('titles.throne.mine', { value: formatCrown(row.id, row.myValue) }) }}</template>
            </div>
          </div>
        </div>
      </section>

      <section v-for="group in groups" :key="group.id" class="mb-6">
        <h3 class="text-sm font-bold text-gray-300 mb-2">{{ $t(`titles.groups.${group.id}`) }}</h3>
        <div class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="card in group.cards"
            :key="card.id"
            class="tv-card tv-tap"
            :class="{ locked: !card.tier }"
            :data-family="card.id"
            role="button"
            tabindex="0"
            @click="openDetail('title', card.id)"
            @keydown.enter="openDetail('title', card.id)"
          >
            <div class="flex items-center justify-between gap-2 min-w-0">
              <TitleBadge v-if="card.tier" :family-id="card.id" :tier="card.tier" :name-set="nameSet" />
              <span v-else class="tv-locked">
                <i class="fas fa-lock mr-1"></i>{{ card.secret ? $t('titles.hiddenName') : $t('titles.locked') }}
              </span>
              <span v-if="card.tier" class="text-[10px] text-gray-400 flex-shrink-0">{{ $t(`titles.rarity.${titleRarity(card.tier)}`) }}</span>
            </div>

            <!-- Hidden and still locked: only the riddle -->
            <p v-if="card.secret" class="tv-hint">🔮 {{ $t(card.hintKey) }}</p>
            <template v-else>
              <p class="tv-desc">{{ $t(card.descKey) }}</p>
              <!-- Where on the ten steps: Ⅲ / Ⅹ and a dot per step in its rarity -->
              <div class="tv-ladder" :aria-label="$t('titles.stepsOf', { n: card.tier, total: card.steps.length })">
                <span class="tv-roman" data-testid="tier-roman">{{ roman(card.tier) }} / {{ roman(card.steps.length) }}</span>
                <span class="tv-dots" aria-hidden="true">
                  <span
                    v-for="step in card.steps"
                    :key="step.tier"
                    class="tv-dot"
                    :class="[titleRarity(step.tier), { reached: step.tier <= card.tier }]"
                  ></span>
                </span>
              </div>
              <div class="tv-bar"><div class="tv-fill" :class="titleRarity(card.progress.next?.tier || card.tier)" :style="{ width: `${Math.round(card.progress.ratio * 100)}%` }"></div></div>
              <div class="flex justify-between gap-2 text-[11px] mt-1 min-w-0">
                <span class="text-gray-300 font-mono flex-shrink-0">
                  {{ formatValue(card.id, card.progress.value) }}<template v-if="card.progress.next"> / {{ formatValue(card.id, card.progress.next.threshold) }}</template>
                </span>
                <span class="text-gray-400 truncate" data-testid="tier-next">
                  {{ card.progress.next ? $t('titles.next', { name: stepName(card.id, card.progress.next.tier) }) : $t('titles.maxed') }}
                </span>
              </div>
            </template>
            <span class="tv-more-hint">{{ $t('titles.codexDetail.tapForMore') }} <i class="fas fa-chevron-right" aria-hidden="true"></i></span>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <!-- 頭像框: every frame, how far I am, tap for how to get it -->
      <section class="mb-6" data-testid="codex-frames">
        <p class="text-[11px] text-gray-400 mb-2">{{ $t('titles.codexDetail.framesSub') }}</p>
        <div v-for="group in frameGroups" :key="group.kind" class="mb-3">
          <div class="tv-frame-group">
            {{ $t(`titles.codexDetail.kind.${group.kind}`) }}
            <span class="text-gray-500 font-normal">{{ group.earned }} / {{ group.items.length }}</span>
          </div>
          <div class="tv-frame-grid">
            <button
              v-for="f in group.items"
              :key="f.id"
              type="button"
              class="tv-frame"
              :class="{ earned: f.earned, worn: f.worn }"
              :data-frame="f.id"
              @click="openDetail('frame', f.id)"
            >
              <PlayerAvatar size="md" :src="user?.photoURL || ''" :name="displayName || ''" :frame="f.id" :still="!f.earned" />
              <span class="tv-frame-name">{{ $t(`titles.frames.${f.id}`) }}</span>
              <span class="tv-frame-sub">{{ f.sub }}</span>
            </button>
          </div>
        </div>
      </section>
    </template>

    <CodexDetail :item="openItem" :ctx="detailCtx" @close="closeDetail" @open="switchDetail" @go-profile="goProfile" />
  </div>
</template>

<script setup>
// 稱號圖鑑, two tabs. 稱號: the 本月王座 of my 牌友圈 (worn this month = won
// last month, and this month's race) and every title family by 系列 (tier
// held Ⅲ / Ⅹ, progress to the next one from my all-time leaderboardStats);
// hidden ones as ??? + a riddle until their first step. 頭像框: every frame
// with where I stand (the collection; a family's themed frame is also one tap
// away from its title).
// A tap opens the detail dialog (CodexDetail): the ten steps, how to get a
// frame, how many players hold each (site-wide from titleStats/global, and in
// my 牌友圈). The open item lives in the route (?item=kind:id), so the phone's
// back button closes it. Names are in the name set I picked (prefs.nameSet);
// the 王座 crowns have one set.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuth } from '../composables/useAuth.js';
import { useUserTitles } from '../composables/useUserTitles.js';
import TitleBadge from '../components/common/TitleBadge.vue';
import PlayerAvatar from '../components/common/PlayerAvatar.vue';
import CodexDetail from '../components/titles/CodexDetail.vue';
import { formatNumber } from '../utils/formatters.js';
import {
  TITLE_FAMILIES, TITLE_GROUPS, CROWN_TIER, nextTierProgress, titleRarity, titleCount,
  CROWN_IDS, CROWN_MIN_GROUP_GAMES, CROWN_MIN_PALS, crownLeaders, crownValue, getCrown,
  getTitleFamily, getThemeFrame, normalizeTitlePrefs, titleName, wonCrownMonths,
} from '../utils/titles.js';
import {
  FRAME_KINDS, crownWearers, frameStatus, framesOfKind, frameKind,
} from '../utils/codex.js';
import { statsDocId } from '../../functions/src/utils/leaderboardStatsMath.js';
import { TITLE_STATS_COLLECTION, TITLE_STATS_DOC } from '../../functions/src/utils/titleStatsMath.js';

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const { user, displayName } = useAuth();
const { titles, watchMyTitles, ensureUserTitles, palsOf, currentCrownMonth } = useUserTitles();

const stats = ref(null);
const loading = ref(true);
let stopWatch = () => {};

const myDoc = computed(() => titles[user.value?.uid] || null);
const unlocked = computed(() => myDoc.value?.unlocked || {});
// Every tier is its own title: count steps held out of all steps (28 × 10)
const totalTitleSteps = TITLE_FAMILIES.reduce((sum, f) => sum + f.tiers.length, 0);
// 頭像框: every step reached is one title; the frame shown comes from the display
const myTitleCount = computed(() => titleCount(unlocked.value));
const myFrame = computed(() => myDoc.value?.display?.frame || null);
// The names every step shows in: my own set
const nameSet = computed(() => normalizeTitlePrefs(myDoc.value?.prefs).nameSet);
function stepName(familyId, tier) {
  return titleName({ t, te }, familyId, tier, nameSet.value);
}

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
      // A hidden family shows its whole ladder once its first step is reached
      steps: f.tiers,
    };
  }),
})));

const ROMAN = ['—', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
// Tier as a roman numeral (— before the first step)
function roman(tier) {
  return ROMAN[tier] || String(tier);
}

// Money families show as amounts, σ with decimals, the rest as counts
function formatValue(familyId, value) {
  if (familyId === 'volatile') return Number(value || 0).toFixed(1);
  if (familyId === 'bigWin' || familyId === 'bigLoss') return `${formatNumber(Math.round((value || 0) * 10) / 10)}`;
  return formatNumber(Math.round(value || 0));
}

// ── Tabs (?tab=frames; none = 稱號) ────────────────────────────────
// In the route so 我的 › 頭像框 can link straight to the frames, and a
// dialog's back keeps the tab it was opened from. A switch replaces the entry:
// back leaves the 圖鑑 instead of stepping through tabs.
const TABS = ['titles', 'frames'];
const activeTab = computed(() => (route.query.tab === 'frames' ? 'frames' : 'titles'));
function setTab(tab) {
  if (tab === activeTab.value) return;
  const query = { ...route.query };
  if (tab === 'frames') query.tab = 'frames';
  else delete query.tab;
  router.replace({ query });
  window.scrollTo?.({ top: 0 });
}

// ── 本月王座 ───────────────────────────────────────────────────────
// My circle's month stats (one doc each: me + my pals) and their userTitles
// through the shared cache (avatars / names / crowns worn). The race leaders
// are judged with the same rules the server uses; for me that is exactly
// whether I lead (my circle is the one I'm judged in).
const crownMonth = currentCrownMonth();
const myPals = computed(() => palsOf(user.value?.uid));
const circleStats = ref({});
let circleKey = '';

// Waits for my userTitles doc (the pals), so the circle loads once
watch(() => [user.value?.uid, !!titles[user.value?.uid], myPals.value.join(',')], async ([uid, ready]) => {
  if (!uid || !ready) return;
  const members = [uid, ...myPals.value];
  const key = `${crownMonth}:${members.join(',')}`;
  if (key === circleKey) return;
  circleKey = key;
  ensureUserTitles(myPals.value);
  const loaded = {};
  await Promise.all(members.map(async (member) => {
    try {
      const snap = await getDoc(doc(db, 'leaderboardStats', statsDocId(member, crownMonth)));
      loaded[member] = snap.exists() ? snap.data() : null;
    } catch (error) {
      console.warn('[titles] crown stats load failed', member, error?.code || error);
    }
  }));
  if (circleKey === key) circleStats.value = loaded;
}, { immediate: true });

// Me + my pals whose userTitles are loaded (crowns worn, circle counts)
const circleMembers = computed(() => {
  const me = user.value?.uid;
  if (!me) return [];
  return [me, ...myPals.value].filter((uid) => titles[uid]).map((uid) => ({ uid, doc: titles[uid] }));
});
const circleDocs = computed(() => circleMembers.value.map((m) => m.doc));

const throne = computed(() => {
  const me = user.value?.uid;
  if (!me) return [];
  const members = [me, ...myPals.value].map((uid) => ({ uid, stats: circleStats.value[uid] || null }));
  const mine = circleStats.value[me] || null;
  return CROWN_IDS.map((id) => {
    const { holders, value } = crownLeaders(id, members);
    const myValue = crownValue(id, mine);
    return {
      id,
      private: getCrown(id)?.unit === 'money',
      wearing: crownWearers(circleMembers.value, id, crownMonth),
      holders,
      value,
      myValue,
      mine: holders.includes(me),
      gap: value != null && myValue != null ? value - myValue : null,
      playedThisMonth: !!mine && !mine.hidden,
      history: wonCrownMonths(myDoc.value, id, crownMonth).length,
    };
  });
});

function nameOf(uid) {
  if (uid === user.value?.uid) return displayName.value || titles[uid]?.name || '?';
  return circleStats.value[uid]?.name || titles[uid]?.name || '?';
}

// A crown value in its unit: 淘汰 / σ / money / 場
function formatCrown(id, value) {
  const unit = getCrown(id)?.unit;
  const v = Number(value) || 0;
  if (unit === 'sigma') return `σ ${v.toFixed(1)}`;
  if (unit === 'money') return formatNumber(Math.round(v));
  return t(`titles.throne.units.${unit}`, { n: formatNumber(Math.round(v)) });
}

// ── 頭像框 ─────────────────────────────────────────────────────────
// A tile's second line: 戴著中 / 已獲得, else how far (titles held, the
// family's tier, the crown's wins); a hidden family not found yet stays ???
function frameSub(id, status) {
  if (myFrame.value === id) return t('titles.codexDetail.worn');
  if (status.earned) return t('titles.codexDetail.earned');
  if (status.kind === 'crown') {
    return status.wonMonths.length
      ? t('titles.codexDetail.tileWonTimes', { n: status.wonMonths.length })
      : t('titles.codexDetail.notEarned');
  }
  if (status.kind === 'theme') {
    const fam = getTitleFamily(getThemeFrame(id).family);
    if (fam?.hidden && !status.progress.value) return t('titles.hiddenName');
    return t('titles.codexDetail.tileTierOf', { n: status.progress.value, total: status.progress.goal });
  }
  return t('titles.codexDetail.tileCount', { n: status.progress.value, total: status.progress.goal });
}

const frameGroups = computed(() => FRAME_KINDS.map((kind) => {
  const items = framesOfKind(kind).map((id) => {
    const status = frameStatus(id, myDoc.value, crownMonth);
    return { id, earned: status.earned, worn: myFrame.value === id, sub: frameSub(id, status) };
  });
  return { kind, items, earned: items.filter((f) => f.earned).length };
}));
const framesEarned = computed(() => frameGroups.value.reduce((sum, g) => sum + g.earned, 0));
const framesTotal = computed(() => frameGroups.value.reduce((sum, g) => sum + g.items.length, 0));

// ── 幾人拿到 (site-wide) ───────────────────────────────────────────
// One read; without it (rules not deployed, offline) the dialog shows the
// 牌友圈 counts only
const siteStats = ref(null);
getDoc(doc(db, TITLE_STATS_COLLECTION, TITLE_STATS_DOC))
  .then((snap) => { siteStats.value = snap.exists() ? snap.data() : null; })
  .catch((error) => console.warn('[titles] title stats load failed', error?.code || error));

// ── Detail dialog (?item=kind:id) ─────────────────────────────────
const isItem = (kind, id) => (kind === 'title' && !!getTitleFamily(id) && getTitleFamily(id).group !== 'crown')
  || (kind === 'frame' && !!frameKind(id))
  || (kind === 'crown' && CROWN_IDS.includes(id));
const openItem = computed(() => {
  const raw = route.query.item;
  if (typeof raw !== 'string') return null;
  const [kind, id] = raw.split(':');
  return isItem(kind, id) ? { kind, id } : null;
});
// Opened from this page (a history entry to go back over) or from a link
let pushed = false;
watch(openItem, (item) => { if (!item) pushed = false; });

function openDetail(kind, id) {
  pushed = true;
  router.push({ query: { ...route.query, item: `${kind}:${id}` } });
}
// From inside the dialog: same history entry, so back still closes it
function switchDetail(kind, id) {
  router.replace({ query: { ...route.query, item: `${kind}:${id}` } });
}
function closeDetail() {
  if (pushed) {
    pushed = false;
    router.back();
    return;
  }
  const query = { ...route.query };
  delete query.item;
  router.replace({ query });
}
function goProfile() {
  router.push('/profile');
}

const detailCtx = computed(() => ({
  myDoc: myDoc.value,
  allStats: stats.value,
  siteStats: siteStats.value,
  circleDocs: circleDocs.value,
  crownMonth,
  nameSet: nameSet.value,
  myFrame: myFrame.value,
  avatar: user.value?.photoURL || '',
  name: displayName.value || '',
  throneRow: (id) => (myPals.value.length < CROWN_MIN_PALS ? null : throne.value.find((row) => row.id === id) || null),
  crownWearers: (id) => crownWearers(circleMembers.value, id, crownMonth),
  formatValue,
  stepName,
  memberName: nameOf,
}));

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
/* 王座 cards: a crown I hold gets the gold edge. Every row is min-width 0 and
   the names truncate, so several tied holders still fit a 375px phone. */
.tv-throne.held { border-color: rgb(var(--tw-amber-500) / 0.7); background: rgb(var(--tw-amber-500) / 0.08); }
.tv-stack { display: inline-flex; align-items: center; flex-shrink: 0; }
/* A child component's root carries this scope, so .pa matches without :deep */
.tv-stack > .pa + .pa { margin-left: -0.55rem; }
.tv-more {
  margin-left: 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: rgb(var(--tw-slate-300));
}
.tv-holders {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--tw-white));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tv-value {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgb(var(--tw-amber-400));
}
.tv-vacant { font-size: 0.75rem; color: rgb(var(--tw-slate-400)); }
.tv-me {
  margin-top: 0.35rem;
  font-size: 0.68rem;
  color: rgb(var(--tw-slate-400));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tv-locked { font-size: 0.7rem; font-weight: 700; color: rgb(var(--tw-slate-400)); }
.tv-desc { font-size: 0.75rem; color: rgb(var(--tw-slate-300)); margin-top: 0.45rem; }
.tv-hint { font-size: 0.75rem; color: rgb(var(--tw-slate-300)); margin-top: 0.45rem; font-style: italic; }
.tv-bar { height: 0.4rem; border-radius: 999px; background: rgb(var(--tw-slate-700)); margin-top: 0.5rem; overflow: hidden; }
.tv-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
.tv-fill.common { background: #94a3b8; }
.tv-fill.rare { background: #3b82f6; }
.tv-fill.epic { background: #a855f7; }
.tv-fill.legendary { background: linear-gradient(90deg, #f59e0b, #fde047); }
.tv-fill.mythic { background: linear-gradient(90deg, #22d3ee, #a78bfa, #f472b6); }

/* Ⅲ / Ⅹ and ten dots: fixed sizes, the dots shrink before anything wraps */
.tv-ladder { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; min-width: 0; }
.tv-roman {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: rgb(var(--tw-slate-300));
  font-variant-numeric: tabular-nums;
}
.tv-dots { display: flex; gap: 0.2rem; min-width: 0; flex: 0 1 auto; }
.tv-dot {
  width: 0.45rem;
  height: 0.45rem;
  min-width: 0.25rem;
  flex: 0 1 auto;
  border-radius: 999px;
  border: 1px solid rgb(var(--tw-slate-600));
}
.tv-dot.reached { border-color: transparent; }
.tv-dot.reached.common { background: #94a3b8; }
.tv-dot.reached.rare { background: #3b82f6; }
.tv-dot.reached.epic { background: #a855f7; }
.tv-dot.reached.legendary { background: #f59e0b; }
.tv-dot.reached.mythic { background: linear-gradient(135deg, #22d3ee, #a78bfa, #f472b6); }

/* 稱號 | 頭像框: two halves of one bar; the count rides along */
.tv-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.2rem;
  margin-bottom: 1rem;
  border-radius: 0.75rem;
  background: rgb(var(--tw-slate-800));
  border: 1px solid rgb(var(--tw-slate-700));
}
.tv-tab {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.45rem 0.5rem;
  border-radius: 0.55rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: rgb(var(--tw-slate-400));
}
.tv-tab.active { color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-700)); }
.tv-tab-count { margin-left: 0.3rem; font-size: 0.68rem; font-weight: 600; color: rgb(var(--tw-slate-400)); }
.tv-tab.active .tv-tab-count { color: rgb(var(--tw-amber-400)); }
/* Every card opens its detail */
.tv-tap { position: relative; cursor: pointer; text-align: left; }
.tv-tap:focus-visible { outline: 2px solid rgb(var(--tw-amber-500)); outline-offset: 2px; }
.tv-more-hint {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.65rem;
  color: rgb(var(--tw-slate-400));
}
.tv-more-hint .fa-chevron-right { font-size: 0.5rem; margin-left: 0.15rem; }
/* 王座 rows: a fixed label, then the people (truncating) */
.tv-row { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.45rem; min-width: 0; }
.tv-row-label {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 0.3rem;
  color: rgb(var(--tw-slate-300));
  background: rgb(var(--tw-slate-700) / 0.7);
}
.tv-reigning {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: rgb(var(--tw-amber-400));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 頭像框 tiles: same size as the profile picker's */
.tv-frame-group { font-size: 0.75rem; font-weight: 600; color: rgb(var(--tw-slate-300)); margin-bottom: 0.4rem; }
.tv-frame-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.25rem, 1fr)); gap: 0.5rem; }
.tv-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.5rem 0.25rem;
  border-radius: 0.75rem;
  border: 1px dashed rgb(var(--tw-slate-700));
}
.tv-frame :deep(.pa) { opacity: 0.4; }
.tv-frame.earned { border-style: solid; background: rgb(var(--tw-slate-800)); }
.tv-frame.earned :deep(.pa) { opacity: 1; }
.tv-frame.worn { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.1); }
.tv-frame-name, .tv-frame-sub { max-width: 100%; overflow-wrap: anywhere; text-align: center; }
.tv-frame-name { font-size: 0.72rem; font-weight: 600; line-height: 1.25; color: rgb(var(--tw-slate-400)); }
.tv-frame.earned .tv-frame-name { color: rgb(var(--tw-white)); }
.tv-frame-sub { font-size: 0.6rem; line-height: 1.2; color: rgb(var(--tw-slate-400)); }
.tv-frame.worn .tv-frame-sub { color: rgb(var(--tw-amber-400)); }
</style>
