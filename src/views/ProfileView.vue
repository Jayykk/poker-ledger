<template>
  <div class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto text-center">
    <!-- Avatar, in the 頭像框 you show -->
    <div class="flex justify-center mb-4">
      <PlayerAvatar size="lg" :src="userAvatar || ''" :name="displayName || ''" :frame="myFrame" :uid="user?.uid || ''" />
    </div>

    <h2 class="text-xl font-bold text-white mb-1">
      {{ displayName }}
    </h2>
    <div v-if="myDisplay?.familyId" class="flex justify-center mb-1">
      <TitleBadge :family-id="myDisplay.familyId" :tier="myDisplay.tier" />
    </div>
    <p v-if="isGuest" class="text-xs text-amber-500 mb-6">{{ $t('auth.guest') }}</p>

    <!-- Settings -->
    <div class="space-y-3 mt-8 max-w-sm md:max-w-xl mx-auto">
      <!-- Upgrade Account for Guests -->
      <div v-if="isGuest" class="bg-slate-800 p-5 rounded-2xl border border-amber-600 mb-4">
        <div class="flex justify-between items-center cursor-pointer" @click="upgradeExpanded = !upgradeExpanded">
          <h3 class="text-white font-bold text-lg">{{ $t('profile.upgradeAccount') }}</h3>
          <button class="text-amber-400 transition-transform duration-300" :class="upgradeExpanded ? 'rotate-180' : ''">
            <i class="fas fa-chevron-down"></i>
          </button>
        </div>
        
        <Transition name="expand">
          <div v-if="upgradeExpanded" class="space-y-3 mt-3">
            <p class="text-gray-400 text-sm">{{ $t('profile.upgradeDescription') }}</p>
            
            <BaseInput
              v-model="upgradeForm.email"
              type="email"
              :placeholder="$t('auth.email')"
            />
            <BaseInput
              v-model="upgradeForm.password"
              type="password"
              :placeholder="$t('auth.password')"
            />
            <BaseInput
              v-model="upgradeForm.name"
              type="text"
              :placeholder="$t('profile.lastChanceToRename')"
            />
            
            <BaseButton
              @click="handleUpgrade"
              :loading="upgradeLoading"
              :disabled="upgradeLoading"
              variant="secondary"
              fullWidth
            >
              {{ $t('profile.linkEmail') }}
            </BaseButton>
            
            <div v-if="upgradeError" class="text-rose-400 text-xs">{{ upgradeError }}</div>
          </div>
        </Transition>
      </div>

      <!-- 稱號 -->
      <BaseCard padding="md">
        <div class="flex justify-between items-center gap-2">
          <span class="text-white">{{ $t('titles.title') }}</span>
          <router-link to="/titles" class="text-sm text-amber-400 whitespace-nowrap">
            <i class="fas fa-book-open mr-1"></i>{{ $t('titles.codex') }}<i class="fas fa-chevron-right text-xs ml-1"></i>
          </router-link>
        </div>
        <div class="text-xs text-gray-400 text-left mt-1">
          {{ $t('titles.unlockedCount', { n: unlockedTitles.length, total: TITLE_FAMILIES.length }) }}
        </div>

        <!-- 顯示方式 + 指定: folded to one row showing what's on now -->
        <button type="button" class="title-fold" :aria-expanded="titleOpen" @click="titleOpen = !titleOpen">
          <span class="text-xs text-gray-400 whitespace-nowrap">{{ $t('titles.mode') }}</span>
          <span class="title-fold-now">
            <TitleBadge v-if="titlePrefs.mode !== 'off' && myDisplay?.familyId" :family-id="myDisplay.familyId" :tier="myDisplay.tier" />
            <span v-else class="text-xs text-gray-300">{{ $t(`titles.mode${titlePrefs.mode === 'off' ? 'Off' : titlePrefs.mode === 'auto' ? 'Auto' : 'Pick'}`) }}</span>
          </span>
          <i class="fas fa-chevron-down title-fold-icon" :class="{ open: titleOpen }" aria-hidden="true"></i>
        </button>
        <div v-if="titleOpen" class="text-left">
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="m in titleModes"
              :key="m.id"
              type="button"
              class="title-mode"
              :class="{ active: titlePrefs.mode === m.id }"
              :disabled="titleSaving || (m.id === 'pick' && !pickableTitles.length)"
              @click="setTitleMode(m.id)"
            >
              {{ $t(m.label) }}
            </button>
          </div>
          <p class="text-[11px] text-gray-400 mt-1.5">
            <template v-if="titlePrefs.mode === 'off'">{{ $t('titles.modeOffHint') }}</template>
            <template v-else-if="titlePrefs.mode === 'auto'">{{ $t('titles.modeAutoHint') }}</template>
            <template v-else>{{ $t('titles.pick') }}</template>
          </p>

        <div v-if="titlePrefs.mode === 'pick' && pickableTitles.length" class="title-pick-grid">
          <button
            v-for="item in pickableTitles"
            :key="item.familyId"
            type="button"
            class="title-pick"
            :class="{ active: titlePrefs.titleId === item.familyId, crown: isCrownId(item.familyId) }"
            :disabled="titleSaving"
            @click="pickTitle(item.familyId)"
          >
            <TitleBadge :family-id="item.familyId" :tier="item.tier" />
            <span class="title-pick-sub">{{ $t(`titles.families.${item.familyId}.desc`) }}</span>
            <i v-if="titlePrefs.titleId === item.familyId" class="fas fa-check title-pick-check" aria-hidden="true"></i>
          </button>
        </div>
        <p v-if="!pickableTitles.length" class="text-xs text-gray-500 text-left mt-2">{{ $t('titles.noneUnlocked') }}</p>
        </div>

        <!-- 頭像框: folded the same way; earned ones to pick, locked ones dashed with what they need -->
        <button type="button" class="title-fold" :aria-expanded="frameOpen" @click="frameOpen = !frameOpen">
          <span class="text-xs text-gray-400 whitespace-nowrap">{{ $t('titles.frame') }}</span>
          <span class="title-fold-now">
            <span class="text-[11px] text-amber-400 whitespace-nowrap">{{ $t('titles.titleCount', { n: myTitleCount }) }}</span>
            <span class="text-xs text-gray-300 truncate">{{ frameSummary }}</span>
          </span>
          <i class="fas fa-chevron-down title-fold-icon" :class="{ open: frameOpen }" aria-hidden="true"></i>
        </button>
        <div v-if="frameOpen" class="text-left">
          <div class="grid grid-cols-4 sm:grid-cols-7 gap-2">
            <button
              type="button"
              class="frame-opt"
              :class="{ active: titlePrefs.frame === 'none' }"
              :disabled="titleSaving"
              @click="pickFrame('none')"
            >
              <PlayerAvatar size="md" :src="userAvatar || ''" :name="displayName || ''" :frame="null" />
              <span class="frame-opt-name">{{ $t('titles.frameOff') }}</span>
            </button>
            <button
              type="button"
              class="frame-opt"
              :class="{ active: titlePrefs.frame === 'auto' }"
              :disabled="titleSaving"
              @click="pickFrame('auto')"
            >
              <PlayerAvatar size="md" :src="userAvatar || ''" :name="displayName || ''" :frame="myEarnedFrame" />
              <span class="frame-opt-name">{{ $t('titles.frameAuto') }}</span>
              <span class="frame-opt-sub">{{ myEarnedFrame ? $t(`titles.frames.${myEarnedFrame}`) : $t('titles.frameNone') }}</span>
            </button>
            <button
              v-for="f in frameOptions"
              :key="f.id"
              type="button"
              class="frame-opt"
              :class="{ active: titlePrefs.frame === f.id, locked: f.locked }"
              :disabled="titleSaving || f.locked"
              @click="pickFrame(f.id)"
            >
              <PlayerAvatar size="md" :src="userAvatar || ''" :name="displayName || ''" :frame="f.id" />
              <span class="frame-opt-name">{{ $t(`titles.frames.${f.id}`) }}</span>
              <span v-if="f.locked" class="frame-opt-sub">{{ $t('titles.frameNeed', { n: f.min }) }}</span>
            </button>
          </div>
          <p class="text-[11px] text-gray-400 mt-1.5">{{ $t('titles.frameHint') }}</p>
        </div>

        <div class="flex justify-between items-center gap-3 mt-4 text-left">
          <div class="min-w-0">
            <div class="text-white text-sm">{{ $t('titles.roomTitles') }}</div>
            <div class="text-[11px] text-gray-400">{{ $t('titles.roomTitlesHint') }}</div>
          </div>
          <button
            type="button"
            @click="toggleRoomTitles"
            :disabled="titleSaving"
            class="w-12 h-6 rounded-full transition relative flex-shrink-0"
            :class="titlePrefs.showRoomTitles ? 'bg-emerald-600' : 'bg-slate-700'"
          >
            <div
              class="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform"
              :class="titlePrefs.showRoomTitles ? 'translate-x-6' : 'translate-x-0.5'"
            ></div>
          </button>
        </div>
      </BaseCard>

      <!-- Language -->
      <BaseCard padding="md">
        <div class="flex justify-between items-center">
          <span class="text-white">{{ $t('profile.language') }}</span>
          <select
            v-model="selectedLanguage"
            @change="handleLanguageChange"
            class="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1 text-white"
          >
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </BaseCard>

      <!-- Theme: folded to one row showing the current theme, like the 稱號 pickers -->
      <BaseCard padding="md">
        <button type="button" class="pv-fold" :aria-expanded="themeOpen" @click="themeOpen = !themeOpen">
          <span class="text-white">{{ $t('profile.theme') }}</span>
          <span class="pv-fold-now">{{ $t(`profile.themes.${currentTheme}.name`) }}</span>
          <i class="fas fa-chevron-down title-fold-icon" :class="{ open: themeOpen }" aria-hidden="true"></i>
        </button>
        <div v-if="themeOpen" class="grid grid-cols-2 gap-2 mt-3">
          <button
            v-for="th in themeOptions"
            :key="th.id"
            type="button"
            @click="setTheme(th.id)"
            class="theme-opt"
            :class="{ active: currentTheme === th.id }"
          >
            <span class="flex items-center justify-between gap-1">
              <span class="text-sm font-semibold text-white">{{ $t(`profile.themes.${th.id}.name`) }}</span>
              <i v-if="currentTheme === th.id" class="fas fa-check text-amber-400 text-xs"></i>
            </span>
            <span class="text-[11px] text-gray-400 leading-snug">{{ $t(`profile.themes.${th.id}.desc`) }}</span>
          </button>
        </div>
      </BaseCard>

      <!-- Sound -->
      <BaseCard padding="md">
        <div class="flex justify-between items-center">
          <span class="text-white">{{ $t('profile.sound') }}</span>
          <button
            @click="toggleSound"
            class="w-12 h-6 rounded-full transition relative"
            :class="soundEnabled ? 'bg-emerald-600' : 'bg-slate-700'"
          >
            <div
              class="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform"
              :class="soundEnabled ? 'translate-x-6' : 'translate-x-0.5'"
            ></div>
          </button>
        </div>
      </BaseCard>

      <!-- Notifications -->
      <BaseCard padding="md">
        <div class="flex justify-between items-center">
          <span class="text-white">{{ $t('profile.notifications') }}</span>
          <button
            @click="handleToggleNotifications"
            class="w-12 h-6 rounded-full transition relative"
            :class="notificationsEnabled ? 'bg-emerald-600' : 'bg-slate-700'"
          >
            <div
              class="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform"
              :class="notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'"
            ></div>
          </button>
        </div>
      </BaseCard>

      <!-- LINE Notify -->
      <BaseCard v-if="isLineUser" padding="md">
        <div class="flex justify-between items-center">
          <span class="text-white">{{ $t('profile.lineNotify') }}</span>
          <button
            @click="toggleLineNotify"
            class="w-12 h-6 rounded-full transition relative"
            :class="lineNotifyEnabled ? 'bg-emerald-600' : 'bg-slate-700'"
          >
            <div
              class="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform"
              :class="lineNotifyEnabled ? 'translate-x-6' : 'translate-x-0.5'"
            ></div>
          </button>
        </div>
      </BaseCard>

      <!-- Logout (hidden inside the LINE client — logout isn't possible in LIFF) -->
      <BaseButton v-if="!isInLineClient" @click="handleLogout" variant="danger" fullWidth>
        {{ $t('auth.logout') }}
      </BaseButton>
    </div>

    <div class="mt-8 text-xs text-gray-600">
      {{ $t('profile.version') }} 10.0.0
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { usePushNotification } from '../composables/usePushNotification.js';
import { useNotification } from '../composables/useNotification.js';
import { useLiff } from '../composables/useLiff.js';
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import TitleBadge from '../components/common/TitleBadge.vue';
import PlayerAvatar from '../components/common/PlayerAvatar.vue';
import { useUserTitles } from '../composables/useUserTitles.js';
import {
  TITLE_FAMILIES, FRAME_TIERS, getTitleFamily, normalizeTitlePrefs, titleCount, earnedFrame, frameRank,
  activeCrowns, isCrownId,
} from '../utils/titles.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { THEMES as THEME_LIST, applyTheme, resolveThemeId } from '../utils/themes.js';

const { t, locale } = useI18n();
const router = useRouter();
const { displayName, isGuest, user, logout, linkEmailToGuest } = useAuth();
const { notificationsEnabled, toggleNotifications } = usePushNotification();
const { lineNotifyEnabled, toggleLineNotify, isInLineClient } = useLiff();
const notification = useNotification();

const userAvatar = computed(() => user.value?.photoURL || null);
const isLineUser = computed(() => user.value?.uid?.startsWith('line_') ?? false);

const selectedLanguage = ref(locale.value);
const currentTheme = ref(resolveThemeId(localStorage.getItem(STORAGE_KEYS.THEME)));
// The theme list starts folded: one row with the current theme until opened
const themeOpen = ref(false);
const themeOptions = THEME_LIST.map((th) => ({ id: th.id }));
const soundEnabled = ref(localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false');

const upgradeForm = ref({
  email: '',
  password: '',
  name: displayName.value || t('auth.defaultGuestName')
});
const upgradeLoading = ref(false);
const upgradeError = ref('');
const upgradeExpanded = ref(false);

// ── 稱號 ──────────────────────────────────────────────────────────
// userTitles/{uid} is server-written: read it live, save through setTitlePrefs
const {
  titles, watchMyTitles, saveTitlePrefs, titleDisplayOf, currentCrownMonth,
} = useUserTitles();
const titleModes = [
  { id: 'off', label: 'titles.modeOff' },
  { id: 'auto', label: 'titles.modeAuto' },
  { id: 'pick', label: 'titles.modePick' },
];
const myTitles = computed(() => titles[user.value?.uid] || null);
const titlePrefs = computed(() => normalizeTitlePrefs(myTitles.value?.prefs));
// The stored display, re-resolved when its crown is from an older month
const myDisplay = computed(() => (myTitles.value ? titleDisplayOf(user.value?.uid) : null));
// Highest tier first, then the most recently reached, then 圖鑑 order — a
// backfill unlocks many at the same instant, and without the last key the
// order follows the map's key order, which differs between the callable's
// reply and the snapshot (the list jumped on every pick)
const familyOrder = new Map(TITLE_FAMILIES.map((f, i) => [f.id, i]));
const unlockedTitles = computed(() => Object.entries(myTitles.value?.unlocked || {})
  .filter(([id, entry]) => getTitleFamily(id) && entry?.tier > 0)
  .map(([familyId, entry]) => ({ familyId, tier: entry.tier, at: entry.at || 0 }))
  .sort((a, b) => (b.tier - a.tier) || (b.at - a.at) || (familyOrder.get(a.familyId) - familyOrder.get(b.familyId))));
// 指定 grid: this month's 王座 first (CROWN_IDS order), then the titles
const heldCrownIds = computed(() => activeCrowns(myTitles.value?.crowns, currentCrownMonth()));
const pickableTitles = computed(() => [
  ...heldCrownIds.value.map((familyId) => ({ familyId, tier: 4, at: 0 })),
  ...unlockedTitles.value,
]);
const titleSaving = ref(false);
// 頭像框: titles held, the frame they earn, the one shown (from the display)
const myTitleCount = computed(() => titleCount(myTitles.value?.unlocked));
const myEarnedFrame = computed(() => earnedFrame(myTitles.value?.unlocked));
const myFrame = computed(() => myDisplay.value?.frame || null);
// Both pickers start folded: the card is one short row each until opened
const titleOpen = ref(false);
const frameOpen = ref(false);
const frameSummary = computed(() => {
  if (titlePrefs.value.frame === 'none') return t('titles.frameOff');
  return myFrame.value ? t(`titles.frames.${myFrame.value}`) : t('titles.frameNone');
});
const frameOptions = computed(() => FRAME_TIERS.map((f) => ({
  id: f.id,
  min: f.min,
  locked: frameRank(f.id) > frameRank(myEarnedFrame.value),
})));

let stopTitles = () => {};
watch(() => user.value?.uid, (uid) => {
  stopTitles();
  stopTitles = watchMyTitles(uid);
}, { immediate: true });
onBeforeUnmount(() => stopTitles());

async function saveTitles(prefs) {
  if (!user.value?.uid || titleSaving.value) return;
  titleSaving.value = true;
  try {
    await saveTitlePrefs(user.value.uid, prefs);
  } catch (error) {
    console.warn('[titles] save failed', error?.code || error);
    notification.error(t('titles.saveFailed'));
  } finally {
    titleSaving.value = false;
  }
}

function setTitleMode(mode) {
  if (mode === titlePrefs.value.mode) return;
  if (mode !== 'pick') {
    saveTitles({ mode });
    return;
  }
  // 指定 needs a title: keep the last pick, else what's shown now, else the
  // first in the grid (a held crown or the best title)
  const pickable = new Set(pickableTitles.value.map((item) => item.familyId));
  const titleId = [titlePrefs.value.titleId, myDisplay.value?.familyId, pickableTitles.value[0]?.familyId]
    .find((id) => id && pickable.has(id));
  if (titleId) saveTitles({ mode, titleId });
}

function pickTitle(familyId) {
  if (familyId !== titlePrefs.value.titleId) saveTitles({ mode: 'pick', titleId: familyId });
}

function pickFrame(frame) {
  if (frame !== titlePrefs.value.frame) saveTitles({ frame });
}

function toggleRoomTitles() {
  saveTitles({ showRoomTitles: !titlePrefs.value.showRoomTitles });
}

const handleLanguageChange = () => {
  locale.value = selectedLanguage.value;
  localStorage.setItem(STORAGE_KEYS.LANGUAGE, selectedLanguage.value);
};

const setTheme = (id) => {
  currentTheme.value = applyTheme(id, { storageKey: STORAGE_KEYS.THEME });
};

const toggleSound = () => {
  soundEnabled.value = !soundEnabled.value;
  localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, soundEnabled.value);
};

const handleToggleNotifications = async () => {
  const result = await toggleNotifications();
  
  if (!result.success) {
    // Use setTimeout to avoid blocking the UI toggle animation
    setTimeout(() => {
      if (result.error === 'denied') {
        notification.error(t('profile.errors.notificationDenied'));
      } else if (result.error === 'unsupported') {
        notification.error(t('profile.errors.notificationUnsupported'));
      }
    }, 100);
  }
};

const handleUpgrade = async () => {
  upgradeError.value = '';
  
  if (!upgradeForm.value.email || !upgradeForm.value.password) {
    upgradeError.value = t('profile.emailPasswordRequired');
    return;
  }
  
  upgradeLoading.value = true;
  const success = await linkEmailToGuest(
    upgradeForm.value.email,
    upgradeForm.value.password,
    upgradeForm.value.name || displayName.value || t('auth.defaultGuestName')
  );
  upgradeLoading.value = false;
  
  if (success) {
    notification.success(t('profile.upgradeSuccess'));
    // Reset form
    upgradeForm.value = {
      email: '',
      password: '',
      name: ''
    };
  } else {
    upgradeError.value = t('profile.upgradeError');
  }
};

const handleLogout = async () => {
  await logout();
  router.push('/login');
};
</script>

<style scoped>
.theme-opt {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem;
  border-radius: 0.75rem;
  text-align: left;
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.5);
}
.theme-opt.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.08); }
/* Folded card (主題): label · current choice · chevron */
.pv-fold { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; }
.pv-fold-now {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 0.75rem;
  color: rgb(var(--tw-slate-300));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Folded picker row: label · what's on now · chevron */
.title-fold {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.6rem 0 0.3rem;
  border-top: 1px solid rgb(var(--tw-slate-700));
  text-align: left;
}
.title-fold + div { margin-top: 0.5rem; }
.title-fold-now {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
}
.title-fold-now > .title-badge { max-width: 100%; }
.title-fold-icon { flex-shrink: 0; font-size: 0.7rem; color: rgb(var(--tw-slate-400)); transition: transform 0.2s; }
.title-fold-icon.open { transform: rotate(180deg); }
.title-mode {
  padding: 0.4rem 0;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  color: rgb(var(--tw-slate-300));
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.5);
}
.title-mode.active { color: rgb(var(--tw-white)); border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.12); font-weight: 600; }
.title-mode:disabled:not(.active) { opacity: 0.4; }
/* 指定: equal cells (badge + its series) so a long name or the legendary glow
   stays inside its box */
.title-pick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.5rem;
}
@media (min-width: 768px) { .title-pick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.title-pick {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.55rem 1.5rem 0.5rem 0.6rem;
  border-radius: 0.6rem;
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.5);
  text-align: left;
  overflow: hidden;
}
.title-pick > .title-badge { max-width: 100%; }
.title-pick-sub {
  max-width: 100%;
  font-size: 0.68rem;
  color: rgb(var(--tw-slate-400));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title-pick-check { position: absolute; top: 0.55rem; right: 0.55rem; font-size: 0.7rem; color: rgb(var(--tw-amber-400)); }
.title-pick.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.1); }
/* A crown held this month: gold edge until picked */
.title-pick.crown:not(.active) { border-color: rgb(var(--tw-amber-500) / 0.45); }
.frame-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.5rem 0.25rem;
  border-radius: 0.75rem;
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.5);
}
.frame-opt.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.1); }
.frame-opt.locked { border-style: dashed; background: transparent; }
.frame-opt.locked :deep(.pa) { opacity: 0.35; }
.frame-opt-name { font-size: 0.75rem; font-weight: 600; color: rgb(var(--tw-white)); }
.frame-opt.locked .frame-opt-name { color: rgb(var(--tw-slate-400)); }
.frame-opt-sub { font-size: 0.62rem; line-height: 1.2; color: rgb(var(--tw-slate-400)); text-align: center; }
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>
