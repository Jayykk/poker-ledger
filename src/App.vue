<template>
  <div id="app" class="relative min-h-screen flex flex-col" :data-theme="theme">
    <!-- Global loading overlay -->
    <LoadingSpinner v-if="globalLoading" fullScreen :text="loadingText" />
    
    <!-- Initial loading -->
    <LoadingSpinner v-else-if="loading" fullScreen />
    
    <!-- Main content -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Bottom navigation (only show when authenticated) -->
    <nav v-if="isAuthenticated && $route.path !== '/login'" class="fixed-bottom-nav glass">
      <div class="flex justify-around items-center h-16 max-w-md mx-auto relative">
        <!-- Lobby -->
        <router-link
          to="/lobby"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/lobby' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-home text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.lobby') }}</span>
        </router-link>
        
        <!-- Stats (Report) -->
        <router-link
          to="/report"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/report' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-chart-line text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.stats') }}</span>
        </router-link>
        
        <!-- Center Action Button (Elevated) -->
        <div class="flex flex-col items-center gap-1 w-full h-full justify-center relative">
          <button
            @click="showActionModal = true"
            class="absolute -top-6 w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center text-white text-2xl shadow-lg hover:shadow-xl active:scale-95 transition-all border-4 border-slate-800"
          >
            <i class="fas fa-plus"></i>
          </button>
          <span class="text-[10px] text-gray-500 mt-6">{{ $t('nav.action') }}</span>
        </div>
        
        <!-- Friends -->
        <router-link
          to="/friends"
          class="flex flex-col items-center gap-1 w-full h-full justify-center"
          :class="$route.path === '/friends' ? 'text-amber-500' : 'text-gray-500'"
        >
          <i class="fas fa-user-friends text-xl"></i>
          <span class="text-[10px]">{{ $t('nav.friends') }}</span>
        </router-link>
        
        <!-- Profile -->
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

    <!-- Action Modal -->
    <ActionModal
      v-model="showActionModal"
      @create-online="handleCreateOnline"
      @join-online="handleJoinOnline"
    />

    <!-- Join Room Modal -->
    <BaseModal v-model="showJoinRoomModal" :title="$t('action.joinOnline')">
      <BaseInput
        v-model="joinRoomCode"
        :placeholder="$t('lobby.roomCode')"
        class="mb-4"
        maxlength="6"
      />
      <BaseButton @click="handleJoinRoom" variant="primary" fullWidth>
        {{ $t('common.confirm') }}
      </BaseButton>
    </BaseModal>

    <!-- Toast notifications -->
    <ToastNotification />

    <!-- Action notifications -->
    <ActionNotification />

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
import { useLoadingStore } from './store/modules/loading.js';
import { useConfirm } from './composables/useConfirm.js';
import { useNotification } from './composables/useNotification.js';
import LoadingSpinner from './components/common/LoadingSpinner.vue';
import ToastNotification from './components/common/ToastNotification.vue';
import ActionNotification from './components/common/ActionNotification.vue';
import ConfirmDialog from './components/common/ConfirmDialog.vue';
import ActionModal from './components/common/ActionModal.vue';
import BaseModal from './components/common/BaseModal.vue';
import BaseInput from './components/common/BaseInput.vue';
import BaseButton from './components/common/BaseButton.vue';
import { STORAGE_KEYS, THEMES } from './utils/constants.js';

const router = useRouter();
const { locale, t } = useI18n();
const authStore = useAuthStore();
const gameStore = useGameStore();
const userStore = useUserStore();
const notificationStore = useNotificationStore();
const loadingStore = useLoadingStore();
const { confirm } = useConfirm();
const { error: showError } = useNotification();

const loading = ref(true);
const theme = ref(localStorage.getItem(STORAGE_KEYS.THEME) || THEMES.DARK);
const pendingInvite = ref(null);
const inviteProcessedInMount = ref(false);
const showActionModal = ref(false);
const showJoinRoomModal = ref(false);
const joinRoomCode = ref('');

const isAuthenticated = computed(() => authStore.isAuthenticated);
const isInGame = computed(() => gameStore.isInGame);
const confirmDialog = computed(() => notificationStore.confirmDialog);
const globalLoading = computed(() => loadingStore.isLoading);
const loadingText = computed(() => loadingStore.loadingText);

const handleConfirm = (result) => {
  notificationStore.resolveConfirm(result);
};

const handleCreateOnline = () => {
  // Navigate to poker lobby to create online room
  router.push('/poker-lobby');
};

const handleJoinOnline = () => {
  showJoinRoomModal.value = true;
};

const handleJoinRoom = async () => {
  if (!joinRoomCode.value) {
    showError(t('common.error'));
    return;
  }
  
  // Navigate to poker game with the room code
  // For now, we'll use the existing game join flow
  router.push(`/poker-game/${joinRoomCode.value}`);
  showJoinRoomModal.value = false;
  joinRoomCode.value = '';
};


// Process pending invite
const processPendingInvite = async () => {
  const invite = pendingInvite.value;
  if (!invite) return false;
  
  const shouldJoin = await confirm({
    message: t('game.inviteDetected'),
    type: 'info'
  });
  
  // Clear pending invite (user has made a decision)
  pendingInvite.value = null;
  localStorage.removeItem(STORAGE_KEYS.PENDING_INVITE);
  
  if (shouldJoin) {
    const success = await gameStore.joinByBinding(invite.gameId, invite.seatId);
    if (success) {
      router.push('/game');
      return true;
    }
  }
  
  return false;
};

// Initialize auth
onMounted(async () => {
  try {
    // Check URL params for game invitation
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    const seatId = params.get('seat');
    
    if (gameId && seatId) {
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
      // Save invite info
      pendingInvite.value = { gameId, seatId };
      localStorage.setItem(STORAGE_KEYS.PENDING_INVITE, JSON.stringify({ gameId, seatId }));
    } else {
      // Check localStorage for pending invite
      const saved = localStorage.getItem(STORAGE_KEYS.PENDING_INVITE);
      if (saved) {
        try {
          pendingInvite.value = JSON.parse(saved);
        } catch (e) {
          // Invalid JSON, remove it
          console.warn('Failed to parse pending invite:', e);
          localStorage.removeItem(STORAGE_KEYS.PENDING_INVITE);
        }
      }
    }
    
    await authStore.initAuth();
    
    if (authStore.user) {
      // Load user data
      await userStore.loadUserData();
      
      // Process pending invite first
      const inviteProcessed = await processPendingInvite();
      inviteProcessedInMount.value = true;
      
      // Only check for saved game if no invite was processed
      if (!inviteProcessed) {
        const savedGameId = localStorage.getItem(STORAGE_KEYS.LAST_GAME_ID);
        if (savedGameId) {
          await gameStore.joinGameListener(savedGameId);
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
watch(() => authStore.user, async (newUser, oldUser) => {
  if (newUser && !oldUser) {
    // User just logged in, load data and process pending invite
    // Skip if already processed in onMounted
    if (!inviteProcessedInMount.value) {
      await userStore.loadUserData();
      await processPendingInvite();
    }
  } else if (!newUser) {
    // User logged out
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
