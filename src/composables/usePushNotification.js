import { ref, computed } from 'vue';
import { STORAGE_KEYS } from '../utils/constants.js';
import { useNotificationStore } from '../store/modules/notification.js';

/**
 * Composable for push notifications (now using in-app action notifications)
 */
export function usePushNotification() {
  const notificationStore = useNotificationStore();
  
  const notificationsEnabled = ref(
    localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED) !== 'false'
  );
  
  // In-app notifications are always supported
  const isSupported = computed(() => true);
  
  const canSendNotifications = computed(() => {
    return notificationsEnabled.value;
  });

  /**
   * Request notification permission (no longer needed, but kept for backward compatibility)
   */
  const requestPermission = async () => {
    // In-app notifications don't need browser permission
    notificationsEnabled.value = true;
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, 'true');
    return { success: true };
  };

  /**
   * Send in-app action notification
   */
  const sendNotification = (title, options = {}) => {
    if (!canSendNotifications.value) {
      return null;
    }

    try {
      const id = notificationStore.addActionNotification({
        type: options.type || 'custom',
        title,
        message: options.body || options.message || '',
        duration: options.duration || 30000,
        onConfirm: options.onConfirm || null,
        onDecline: options.onDecline || null
      });
      
      return id;
    } catch (err) {
      console.error('Send notification error:', err);
      return null;
    }
  };

  /**
   * Send game invitation notification with Accept/Decline buttons
   */
  const sendInvitationNotification = (fromName, roomName, onConfirm, onDecline) => {
    // Sanitize inputs to prevent XSS
    const sanitizedFromName = String(fromName || 'Someone').replace(/[<>]/g, '').substring(0, 50);
    const sanitizedRoomName = String(roomName || 'a game').replace(/[<>]/g, '').substring(0, 50);
    
    return sendNotification('Game Invitation', {
      type: 'invitation',
      body: `${sanitizedFromName} invited you to join ${sanitizedRoomName}`,
      duration: 30000,
      onConfirm: onConfirm || null,
      onDecline: onDecline || null
    });
  };

  /**
   * Send game settlement notification (display only, no actions)
   */
  const sendSettlementNotification = (profit) => {
    const profitText = profit >= 0 ? `+${profit}` : `${profit}`;
    return sendNotification('Game Settled', {
      type: 'settlement',
      body: `Your final profit: ${profitText}`,
      duration: 10000 // Shorter duration for info-only notifications
    });
  };

  /**
   * Toggle notifications on/off
   */
  const toggleNotifications = async () => {
    // Toggle the setting
    notificationsEnabled.value = !notificationsEnabled.value;
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, String(notificationsEnabled.value));
    return { success: true };
  };

  return {
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
