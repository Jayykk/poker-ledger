<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px] max-w-md border"
          :class="toastClasses(toast.type)"
        >
          <i class="text-xl" :class="toastIcon(toast.type)"></i>
          <span class="flex-1">{{ toast.message }}</span>
          <button
            @click="removeToast(toast.id)"
            class="text-gray-400 hover:text-white transition"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useNotificationStore } from '../../store/modules/notification.js';

const notificationStore = useNotificationStore();
const toasts = computed(() => notificationStore.toasts);

const removeToast = (id) => {
  notificationStore.removeToast(id);
};

const toastClasses = (type) => {
  const classes = {
    success: 'border-emerald-500 bg-slate-800',
    error: 'border-red-500 bg-slate-800',
    warning: 'border-amber-500 bg-slate-800',
    info: 'border-blue-500 bg-slate-800'
  };
  return classes[type] || classes.info;
};

const toastIcon = (type) => {
  const icons = {
    success: 'fas fa-check-circle text-emerald-500',
    error: 'fas fa-exclamation-circle text-red-500',
    warning: 'fas fa-exclamation-triangle text-amber-500',
    info: 'fas fa-info-circle text-blue-500'
  };
  return icons[type] || icons.info;
};
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px) scale(0.8);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
