<template>
  <Teleport to="body">
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 pointer-events-none w-full max-w-md px-4">
      <TransitionGroup name="action-notification">
        <div
          v-for="notification in actionNotifications"
          :key="notification.id"
          class="pointer-events-auto bg-slate-800 text-white rounded-lg shadow-2xl border overflow-hidden"
          :class="notificationBorderClass(notification.type)"
        >
          <!-- Header -->
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3 mb-3">
              <div 
                class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                :class="notificationIconBgClass(notification.type)"
              >
                <i class="text-lg" :class="notificationIcon(notification.type)"></i>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-base mb-1">{{ notification.title }}</h3>
                <p class="text-sm text-gray-300 break-words">{{ notification.message }}</p>
              </div>
              <button
                @click="handleClose(notification.id)"
                class="text-gray-400 hover:text-white transition flex-shrink-0"
                :aria-label="$t('common.close')"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>

            <!-- Action buttons -->
            <div v-if="notification.onConfirm || notification.onDecline" class="flex gap-2">
              <button
                v-if="notification.onDecline"
                @click="handleDecline(notification)"
                class="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition font-medium text-sm"
              >
                {{ $t('notification.decline') }}
              </button>
              <button
                v-if="notification.onConfirm"
                @click="handleConfirm(notification)"
                class="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition font-medium text-sm"
              >
                {{ $t('notification.accept') }}
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          <div 
            v-if="notification.duration > 0"
            class="h-1 bg-slate-700 relative overflow-hidden"
          >
            <div
              ref="progressBars"
              class="absolute inset-0 h-full transition-none"
              :class="progressBarClass(notification.type)"
              :data-notification-id="notification.id"
            ></div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotificationStore } from '../../store/modules/notification.js';

const { t } = useI18n();
const notificationStore = useNotificationStore();

const actionNotifications = computed(() => notificationStore.actionNotifications);
const progressBars = ref([]);

const handleConfirm = (notification) => {
  notificationStore.handleActionResponse(notification.id, true);
};

const handleDecline = (notification) => {
  notificationStore.handleActionResponse(notification.id, false);
};

const handleClose = (id) => {
  notificationStore.removeActionNotification(id);
};

const notificationBorderClass = (type) => {
  const classes = {
    invitation: 'border-blue-500',
    settlement: 'border-emerald-500',
    custom: 'border-amber-500'
  };
  return classes[type] || 'border-blue-500';
};

const notificationIconBgClass = (type) => {
  const classes = {
    invitation: 'bg-blue-500/20',
    settlement: 'bg-emerald-500/20',
    custom: 'bg-amber-500/20'
  };
  return classes[type] || 'bg-blue-500/20';
};

const notificationIcon = (type) => {
  const icons = {
    invitation: 'fas fa-envelope text-blue-400',
    settlement: 'fas fa-trophy text-emerald-400',
    custom: 'fas fa-bell text-amber-400'
  };
  return icons[type] || 'fas fa-bell text-blue-400';
};

const progressBarClass = (type) => {
  const classes = {
    invitation: 'bg-blue-500',
    settlement: 'bg-emerald-500',
    custom: 'bg-amber-500'
  };
  return classes[type] || 'bg-blue-500';
};

// Manage progress bar animations
const activeAnimations = new Map();

const updateProgressBar = (notification) => {
  nextTick(() => {
    if (!progressBars.value) return;
    
    const progressBar = progressBars.value.find(
      el => el && el.dataset.notificationId === String(notification.id)
    );
    
    if (!progressBar) return;
    
    // Clear any existing animation
    if (activeAnimations.has(notification.id)) {
      cancelAnimationFrame(activeAnimations.get(notification.id));
    }
    
    const startTime = notification.createdAt;
    const duration = notification.duration;
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const percentage = (remaining / duration) * 100;
      
      if (progressBar) {
        progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
      }
      
      if (remaining > 0) {
        const frameId = requestAnimationFrame(animate);
        activeAnimations.set(notification.id, frameId);
      } else {
        activeAnimations.delete(notification.id);
      }
    };
    
    animate();
  });
};

// Watch for new notifications and update progress bars
watch(
  actionNotifications,
  (newNotifications) => {
    newNotifications.forEach(notification => {
      if (notification.duration > 0 && !activeAnimations.has(notification.id)) {
        updateProgressBar(notification);
      }
    });
    
    // Clean up animations for removed notifications
    const currentIds = new Set(newNotifications.map(n => n.id));
    activeAnimations.forEach((frameId, id) => {
      if (!currentIds.has(id)) {
        cancelAnimationFrame(frameId);
        activeAnimations.delete(id);
      }
    });
  },
  { immediate: true, deep: true }
);

onUnmounted(() => {
  // Clean up all animations
  activeAnimations.forEach((frameId) => {
    cancelAnimationFrame(frameId);
  });
  activeAnimations.clear();
});
</script>

<style scoped>
.action-notification-enter-active,
.action-notification-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.action-notification-enter-from {
  opacity: 0;
  transform: translateY(-30px) scale(0.95);
}

.action-notification-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

.action-notification-move {
  transition: transform 0.4s ease;
}
</style>
