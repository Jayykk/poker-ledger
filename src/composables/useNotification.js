import { ref } from 'vue';

/**
 * Composable for notifications/toasts
 */
export function useNotification() {
  const notification = ref({
    show: false,
    message: '',
    type: 'info' // 'success', 'error', 'warning', 'info'
  });

  const showNotification = (message, type = 'info', duration = 3000) => {
    notification.value = {
      show: true,
      message,
      type
    };

    if (duration > 0) {
      setTimeout(() => {
        hideNotification();
      }, duration);
    }
  };

  const hideNotification = () => {
    notification.value.show = false;
  };

  const success = (message, duration = 3000) => {
    showNotification(message, 'success', duration);
  };

  const error = (message, duration = 3000) => {
    showNotification(message, 'error', duration);
  };

  const warning = (message, duration = 3000) => {
    showNotification(message, 'warning', duration);
  };

  const info = (message, duration = 3000) => {
    showNotification(message, 'info', duration);
  };

  /**
   * Show browser notification (requires permission)
   */
  const showBrowserNotification = async (title, options = {}) => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    let permission = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      new Notification(title, {
        icon: '/poker-ledger/icon-192.png',
        badge: '/poker-ledger/icon-192.png',
        ...options
      });
      return true;
    }

    return false;
  };

  /**
   * Copy to clipboard with notification
   */
  const copyWithNotification = async (text, successMsg = 'Copied!') => {
    try {
      await navigator.clipboard.writeText(text);
      success(successMsg);
      return true;
    } catch (err) {
      error('Failed to copy');
      return false;
    }
  };

  return {
    notification,
    showNotification,
    hideNotification,
    success,
    error,
    warning,
    info,
    showBrowserNotification,
    copyWithNotification
  };
}
