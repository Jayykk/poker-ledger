import { defineStore } from 'pinia';
import { ref } from 'vue';

let toastIdCounter = 0;

export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref([]);
  const confirmDialog = ref({
    show: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: '',
    cancelText: '',
    resolve: null
  });

  // Toast functions
  const addToast = (message, type = 'info', duration = 3000) => {
    const id = ++toastIdCounter;
    const toast = {
      id,
      message,
      type
    };

    toasts.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  };

  const removeToast = (id) => {
    const index = toasts.value.findIndex(t => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  };

  const success = (message, duration = 3000) => {
    return addToast(message, 'success', duration);
  };

  const error = (message, duration = 3000) => {
    return addToast(message, 'error', duration);
  };

  const warning = (message, duration = 3000) => {
    return addToast(message, 'warning', duration);
  };

  const info = (message, duration = 3000) => {
    return addToast(message, 'info', duration);
  };

  // Confirm dialog functions
  const confirm = (options) => {
    return new Promise((resolve) => {
      confirmDialog.value = {
        show: true,
        title: options.title || '',
        message: options.message || '',
        type: options.type || 'info',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        resolve
      };
    });
  };

  const resolveConfirm = (result) => {
    if (confirmDialog.value.resolve) {
      confirmDialog.value.resolve(result);
    }
    confirmDialog.value.show = false;
    confirmDialog.value.resolve = null;
  };

  return {
    // Toast
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    
    // Confirm
    confirmDialog,
    confirm,
    resolveConfirm
  };
});
