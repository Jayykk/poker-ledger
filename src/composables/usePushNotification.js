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
      // Safari requires requestPermission to be called directly from user interaction
      // Check if requestPermission is a function (Safari) or property
      let permission;
      
      if (typeof Notification.requestPermission === 'function') {
        // Modern browsers and Safari
        permission = await Notification.requestPermission();
      } else {
        // Fallback for very old browsers
        permission = Notification.permission;
      }
      
      notificationPermission.value = permission;
      
      if (permission === 'granted') {
        notificationsEnabled.value = true;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
        return true;
      } else if (permission === 'denied') {
        // User explicitly denied, disable notifications
        notificationsEnabled.value = false;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'false');
        return false;
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
      console.warn('Notifications are not supported in this browser');
      return false;
    }

    // If user is trying to enable notifications
    if (!notificationsEnabled.value) {
      // Check current permission status
      const currentPermission = Notification.permission;
      
      if (currentPermission === 'denied') {
        // Permission was previously denied, cannot request again
        // User must manually enable in browser settings
        console.warn('Notification permission was denied. Please enable in browser settings.');
        alert('Notification permission was denied. Please enable notifications in your browser settings.');
        return false;
      }
      
      if (currentPermission === 'granted') {
        // Permission already granted, just enable
        notificationsEnabled.value = true;
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
        notificationPermission.value = 'granted';
        return true;
      }
      
      // Permission not yet requested, request it
      const granted = await requestPermission();
      return granted;
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
