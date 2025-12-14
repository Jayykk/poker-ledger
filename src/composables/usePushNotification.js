import { ref, computed } from 'vue';
import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * Composable for push notifications
 */
export function usePushNotification() {
  const notificationPermission = ref(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  
  const notificationsEnabled = ref(
    localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED) === 'true'
  );
  
  const isSupported = computed(() => 'Notification' in window);
  
  const canSendNotifications = computed(() => {
    return isSupported.value && 
           notificationPermission.value === 'granted' && 
           notificationsEnabled.value;
  });

  /**
   * Request notification permission
   */
  const requestPermission = async () => {
    if (!isSupported.value) {
      console.warn('This browser does not support notifications');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      notificationPermission.value = permission;
      
      if (permission === 'granted') {
        notificationsEnabled.value = true;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Request notification permission error:', err);
      return false;
    }
  };

  /**
   * Send push notification
   */
  const sendNotification = (title, options = {}) => {
    if (!canSendNotifications.value) {
      return null;
    }

    try {
      const notification = new Notification(title, {
        icon: '/poker-ledger/icon.svg',
        badge: '/poker-ledger/icon.svg',
        ...options
      });
      
      return notification;
    } catch (err) {
      console.error('Send notification error:', err);
      return null;
    }
  };

  /**
   * Send game invitation notification
   */
  const sendInvitationNotification = (fromName, roomName) => {
    // Sanitize inputs to prevent XSS
    const sanitizedFromName = String(fromName || 'Someone').replace(/[<>]/g, '').substring(0, 50);
    const sanitizedRoomName = String(roomName || 'a game').replace(/[<>]/g, '').substring(0, 50);
    
    return sendNotification('Game Invitation', {
      body: `${sanitizedFromName} invited you to join ${sanitizedRoomName}`,
      tag: 'invitation',
      requireInteraction: true
    });
  };

  /**
   * Send game settlement notification
   */
  const sendSettlementNotification = (profit) => {
    const profitText = profit >= 0 ? `+${profit}` : `${profit}`;
    return sendNotification('Game Settled', {
      body: `Your final profit: ${profitText}`,
      tag: 'settlement'
    });
  };

  /**
   * Toggle notifications on/off
   */
  const toggleNotifications = async () => {
    if (!isSupported.value) {
      return false;
    }

    if (!notificationsEnabled.value) {
      // Enabling notifications
      const granted = await requestPermission();
      if (granted) {
        notificationsEnabled.value = true;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
        return true;
      }
      return false;
    } else {
      // Disabling notifications
      notificationsEnabled.value = false;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'false');
      return true;
    }
  };

  return {
    notificationPermission,
    notificationsEnabled,
    isSupported,
    canSendNotifications,
    requestPermission,
    sendNotification,
    sendInvitationNotification,
    sendSettlementNotification,
    toggleNotifications
  };
}
