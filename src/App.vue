<template>
  <div id="app" class="relative min-h-screen flex flex-col" :data-theme="theme">
    <LoadingSpinner v-if="loading" fullScreen />
    
    <!-- Main content -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Bottom navigation (only show when authenticated) -->
    <nav v-if="isAuthenticated && $route.path !== '/login'" class="fixed-bottom-nav glass">
      <div class="flex justify-around items-center h-16 max-w-md mx-auto">
        <router-link
          to="/lobby"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/lobby' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-home text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.lobby') }}</span>
        </router-link>
        
        <router-link
          to="/game"
          class="flex flex-col items-center gap-1 w-full h-full justify-center relative"
          :class="$route.path === '/game' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-gamepad text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.game') }}</span>
          <span v-if="isInGame" class="absolute top-2 right-8 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
        </router-link>
        
        <router-link
          to="/report"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/report' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-chart-line text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.report') }}</span>
        </router-link>
        
        <router-link
          to="/friends"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/friends' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-user-friends text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.friends') }}</span>
        </router-link>
        
        <router-link
          to="/profile"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/profile' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-user text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.profile') }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Toast notifications -->
    <ToastNotification />

    <!-- Confirm dialog -->
    <ConfirmDialog
      v-model="confirmDialog.show"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :type="confirmDialog.type"
      :confirm-text="confirmDialog.confirmText"
      :cancel-text="confirmDialog.cancelText"
      @confirm="handleConfirm(true)"
      @cancel="handleConfirm(false)"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './store/modules/auth.js';
import { useGameStore } from './store/modules/game.js';
import { useUserStore } from './store/modules/user.js';
import { useNotificationStore } from './store/modules/notification.js';
import { useConfirm } from './composables/useConfirm.js';
import LoadingSpinner from './components/common/LoadingSpinner.vue';
import ToastNotification from './components/common/ToastNotification.vue';
import ConfirmDialog from './components/common/ConfirmDialog.vue';
import { STORAGE_KEYS, THEMES } from './utils/constants.js';

const router = useRouter();
const { locale, t } = useI18n();
const authStore = useAuthStore();
const gameStore = useGameStore();
const userStore = useUserStore();
const notificationStore = useNotificationStore();
const { confirm } = useConfirm();

const loading = ref(true);
const theme = ref(localStorage.getItem(STORAGE_KEYS.THEME) || THEMES.DARK);

const isAuthenticated = computed(() => authStore.isAuthenticated);
const isInGame = computed(() => gameStore.isInGame);
const confirmDialog = computed(() => notificationStore.confirmDialog);

const handleConfirm = (result) => {
  notificationStore.resolveConfirm(result);
};

// Initialize auth
onMounted(async () => {
  try {
    await authStore.initAuth();
    
    if (authStore.user) {
      // Load user data
      await userStore.loadUserData();
      
      // Check for saved game
      const savedGameId = localStorage.getItem(STORAGE_KEYS.LAST_GAME_ID);
      if (savedGameId) {
        await gameStore.joinGameListener(savedGameId);
      }
      
      // Check URL params for game invitation
      const params = new URLSearchParams(window.location.search);
      const gameId = params.get('game');
      const seatId = params.get('seat');
      
      if (gameId && seatId) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const shouldJoin = await confirm({
          message: t('game.inviteDetected'),
          type: 'info'
        });
        if (shouldJoin) {
          const success = await gameStore.joinByBinding(gameId, seatId);
          if (success) {
            router.push('/game');
          }
        }
      }
      
      if (router.currentRoute.value.path === '/' || router.currentRoute.value.path === '/login') {
        router.push('/lobby');
      }
    } else {
      router.push('/login');
    }
  } finally {
    loading.value = false;
  }
});

// Watch for auth changes
watch(() => authStore.user, (newUser) => {
  if (newUser) {
    userStore.loadUserData();
  } else {
    gameStore.cleanup();
    userStore.cleanup();
    router.push('/login');
  }
});

// Apply theme
watch(theme, (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
});

// Set initial theme
document.documentElement.setAttribute('data-theme', theme.value);
</script>
