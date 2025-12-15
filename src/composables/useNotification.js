import { useNotificationStore } from '../store/modules/notification.js';

/**
 * Composable for notifications/toasts
 */
export function useNotification() {
  const notificationStore = useNotificationStore();

  const success = (message, duration = 3000) => {
    return notificationStore.success(message, duration);
  };

  const error = (message, duration = 3000) => {
    return notificationStore.error(message, duration);
  };

  const warning = (message, duration = 3000) => {
    return notificationStore.warning(message, duration);
  };

  const info = (message, duration = 3000) => {
    return notificationStore.info(message, duration);
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
        icon: '/poker-ledger/icon.svg',
        badge: '/poker-ledger/icon.svg',
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
    success,
    error,
    warning,
    info,
    showBrowserNotification,
    copyWithNotification
  };
}
