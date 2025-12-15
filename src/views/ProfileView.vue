<template>
  <div class="pt-8 px-4 pb-24 text-center">
    <!-- Avatar -->
    <div class="w-20 h-20 bg-slate-700 rounded-full mx-auto flex items-center justify-center text-3xl mb-4">
      <i class="fas fa-user text-gray-400"></i>
    </div>
    
    <h2 class="text-xl font-bold text-white mb-1">
      {{ displayName }}
    </h2>
    <p v-if="isGuest" class="text-xs text-amber-500 mb-6">{{ $t('auth.guest') }}</p>

    <!-- Settings -->
    <div class="space-y-3 mt-8 max-w-sm mx-auto">
      <!-- Upgrade Account for Guests -->
      <div v-if="isGuest" class="bg-slate-800 p-5 rounded-2xl border border-amber-600 space-y-3 mb-4">
        <h3 class="text-white font-bold text-lg">{{ $t('profile.upgradeAccount') }}</h3>
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

      <!-- Theme -->
      <BaseCard padding="md">
        <div class="flex justify-between items-center">
          <span class="text-white">{{ $t('profile.theme') }}</span>
          <div class="flex gap-2">
            <button
              @click="setTheme('dark')"
              class="px-3 py-1 rounded-lg text-sm transition"
              :class="currentTheme === 'dark' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
            >
              {{ $t('profile.themeOptions.dark') }}
            </button>
            <button
              @click="setTheme('light')"
              class="px-3 py-1 rounded-lg text-sm transition"
              :class="currentTheme === 'light' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
            >
              {{ $t('profile.themeOptions.light') }}
            </button>
          </div>
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

      <!-- Logout -->
      <BaseButton @click="handleLogout" variant="danger" fullWidth>
        {{ $t('auth.logout') }}
      </BaseButton>
    </div>

    <div class="mt-8 text-xs text-gray-600">
      {{ $t('profile.version') }} 10.0.0
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth.js';
import { usePushNotification } from '../composables/usePushNotification.js';
import { useNotification } from '../composables/useNotification.js';
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseInput from '../components/common/BaseInput.vue';
import { STORAGE_KEYS, THEMES } from '../utils/constants.js';

const { t, locale } = useI18n();
const router = useRouter();
const { displayName, isGuest, logout, linkEmailToGuest } = useAuth();
const { notificationsEnabled, toggleNotifications } = usePushNotification();
const notification = useNotification();

const selectedLanguage = ref(locale.value);
const currentTheme = ref(localStorage.getItem(STORAGE_KEYS.THEME) || THEMES.DARK);
const soundEnabled = ref(localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false');

const upgradeForm = ref({
  email: '',
  password: '',
  name: displayName.value || t('auth.defaultGuestName')
});
const upgradeLoading = ref(false);
const upgradeError = ref('');

const handleLanguageChange = () => {
  locale.value = selectedLanguage.value;
  localStorage.setItem(STORAGE_KEYS.LANGUAGE, selectedLanguage.value);
};

const setTheme = (theme) => {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
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
        window.alert(t('profile.errors.notificationDenied'));
      } else if (result.error === 'unsupported') {
        window.alert(t('profile.errors.notificationUnsupported'));
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
