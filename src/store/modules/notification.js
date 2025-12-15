import { defineStore } from 'pinia';
import { ref } from 'vue';

let toastIdCounter = 0;
let actionNotificationIdCounter = 0;

export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref([]);
  const actionNotifications = ref([]);
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

  // Action notification functions
  const addActionNotification = (options) => {
    const id = ++actionNotificationIdCounter;
    
    // Store callbacks separately to avoid closure issues
    const onConfirmCallback = options.onConfirm || null;
    const onDeclineCallback = options.onDecline || null;
    
    const notification = {
      id,
      type: options.type || 'custom',
      title: options.title || '',
      message: options.message || '',
      duration: options.duration || 30000, // Default 30 seconds
      onConfirm: onConfirmCallback,
      onDecline: onDeclineCallback,
      createdAt: Date.now()
    };

    actionNotifications.value.push(notification);

    // Auto-remove after duration (treat as decline)
    if (notification.duration > 0) {
      setTimeout(() => {
        const exists = actionNotifications.value.find(n => n.id === id);
        if (exists) {
          // Auto-expire is treated as decline - call the stored callback
          if (onDeclineCallback) {
            onDeclineCallback();
          }
          removeActionNotification(id);
        }
      }, notification.duration);
    }

    return id;
  };

  const removeActionNotification = (id) => {
    const index = actionNotifications.value.findIndex(n => n.id === id);
    if (index > -1) {
      actionNotifications.value.splice(index, 1);
    }
  };

  const handleActionResponse = (id, accepted) => {
    const notification = actionNotifications.value.find(n => n.id === id);
    if (!notification) return;

    // Call the appropriate callback
    if (accepted && notification.onConfirm) {
      notification.onConfirm();
    } else if (!accepted && notification.onDecline) {
      notification.onDecline();
    }

    // Remove the notification
    removeActionNotification(id);
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
    resolveConfirm,

    // Action notifications
    actionNotifications,
    addActionNotification,
    removeActionNotification,
    handleActionResponse
  };
});
