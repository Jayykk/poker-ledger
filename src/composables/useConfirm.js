import { useNotificationStore } from '../store/modules/notification.js';
import { useI18n } from 'vue-i18n';

/**
 * Composable for confirmation dialogs
 */
export function useConfirm() {
  const notificationStore = useNotificationStore();
  const { t } = useI18n();

  /**
   * Show a confirmation dialog
   * @param {Object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.message - Dialog message
   * @param {string} options.type - Dialog type: 'info', 'warning', 'danger'
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @returns {Promise<boolean>} - Returns true if confirmed, false if cancelled
   */
  const confirm = async (options) => {
    const defaults = {
      title: t('common.confirm'),
      message: '',
      type: 'info',
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel')
    };

    const mergedOptions = { ...defaults, ...options };
    return await notificationStore.confirm(mergedOptions);
  };

  /**
   * Show a warning confirmation dialog
   */
  const confirmWarning = async (message, title = null) => {
    return await confirm({
      title: title || t('common.confirm'),
      message,
      type: 'warning'
    });
  };

  /**
   * Show a danger confirmation dialog (for destructive actions)
   */
  const confirmDanger = async (message, title = null) => {
    return await confirm({
      title: title || t('common.confirm'),
      message,
      type: 'danger'
    });
  };

  return {
    confirm,
    confirmWarning,
    confirmDanger
  };
}
