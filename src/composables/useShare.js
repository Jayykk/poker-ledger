/**
 * useShare — share by where the app is running.
 *
 *   In LINE (LIFF)      callers send Flex Messages (useLiff); `inLine` tells them
 *   Web / home screen   the system share sheet (LINE is one of its targets);
 *                       without one (desktop browsers), the text is copied
 *
 * Links point at the LIFF URL, so a friend tapping one lands in LINE like
 * the Flex Messages' buttons do.
 */
import { useI18n } from 'vue-i18n';
import { useLiff } from './useLiff.js';
import { useNotification } from './useNotification.js';
import { liffLink } from '../utils/liffLink.js';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';

/** Link to a page of the app (path without the leading slash). */
export function appLink(path) {
  const p = String(path || '').replace(/^\/+/, '');
  if (LIFF_ID) return liffLink(LIFF_ID, p);
  return `${window.location.origin}${window.location.pathname}#/${p}`;
}

export function useShare() {
  const { t } = useI18n();
  const { isInLineClient } = useLiff();
  const { success, error } = useNotification();

  /**
   * Share text outside LINE. Must run from a tap (the share sheet needs one).
   * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
   */
  async function shareOut({ title, text }) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // fall through to copying (e.g. the sheet refused this content)
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      success(t('share.copied'));
      return 'copied';
    } catch {
      error(t('share.failed'));
      return 'failed';
    }
  }

  return { inLine: isInLineClient, shareOut };
}
