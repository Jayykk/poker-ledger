import { ref, readonly } from 'vue';
import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';

const isInitialized = ref(false);
const isInLineClient = ref(false);
const isLoggedIn = ref(false);
const lineProfile = ref(null);
const liffError = ref('');

// Cached promise to prevent double-init race condition
let _initPromise = null;

/**
 * Initialize LIFF SDK (singleton — safe to call multiple times concurrently)
 */
const initLiff = async () => {
  if (isInitialized.value) return true;
  if (_initPromise) return _initPromise;
  if (!LIFF_ID) {
    console.warn('[LIFF] No LIFF_ID configured, skipping LIFF init');
    return false;
  }

  _initPromise = (async () => {
    try {
      await liff.init({ liffId: LIFF_ID });
      isInitialized.value = true;
      isInLineClient.value = liff.isInClient();
      isLoggedIn.value = liff.isLoggedIn();
      return true;
    } catch (err) {
      // LIFF throws if init() is called twice (e.g. early token processing
      // already called it). Detect this and treat as success.
      try {
        const loggedIn = liff.isLoggedIn();
        // If isLoggedIn() didn't throw, LIFF is actually initialized
        isInitialized.value = true;
        isInLineClient.value = liff.isInClient();
        isLoggedIn.value = loggedIn;
        return true;
      } catch {
        // LIFF genuinely not initialized — real error
      }
      console.error('[LIFF] Init failed:', err);
      liffError.value = err.message;
      _initPromise = null; // Allow retry on failure
      return false;
    }
  })();

  return _initPromise;
};

/**
 * Trigger LINE login (redirects in external browser, no-op in LINE client)
 */
const loginWithLiff = () => {
  if (!isInitialized.value) return;
  if (!liff.isLoggedIn()) {
    liff.login();
  }
};

/**
 * Get LINE access token (for backend verification)
 */
const getAccessToken = () => {
  if (!isInitialized.value || !liff.isLoggedIn()) return null;
  return liff.getAccessToken();
};

/**
 * Fetch LINE profile: { userId, displayName, pictureUrl, statusMessage }
 */
const fetchProfile = async () => {
  if (!isInitialized.value || !liff.isLoggedIn()) return null;
  try {
    const profile = await liff.getProfile();
    lineProfile.value = profile;
    return profile;
  } catch (err) {
    console.error('[LIFF] getProfile failed:', err);
    return null;
  }
};

/**
 * Send messages to the current chat (user's own name) — FREE, no quota
 * Only works when opened from a LINE chat room.
 */
const sendMessages = async (messages) => {
  if (!isInitialized.value || !liff.isInClient()) return false;
  try {
    await liff.sendMessages(messages);
    return true;
  } catch (err) {
    console.error('[LIFF] sendMessages failed:', err);
    return false;
  }
};

/**
 * Send a buy-in notification to the current LINE chat
 */
const sendBuyInMessage = async (actionName, targetName, amount) => {
  const isSelf = actionName === targetName;
  const text = isSelf
    ? `💰 ${actionName} 買入了 $${amount}`
    : `💰 ${actionName} 幫 ${targetName} 買入了 $${amount}`;
  return sendMessages([{ type: 'text', text }]);
};

/**
 * Send an undo notification to the current LINE chat
 */
const sendUndoMessage = async (actionName, targetName, amount) => {
  const text = `↩️ ${actionName} 撤銷了 ${targetName} 的一筆 $${amount} 買入`;
  return sendMessages([{ type: 'text', text }]);
};

/**
 * Send settlement report to the current LINE chat
 */
const sendSettlementMessage = async (reportText) => {
  return sendMessages([{ type: 'text', text: reportText }]);
};

/**
 * Share a game invite via LINE share target picker
 */
const shareGameInvite = async (gameName, gameId, hostName) => {
  if (!isInitialized.value) return false;
  try {
    const liffUrl = `https://liff.line.me/${LIFF_ID}/game/${gameId}`;
    const result = await liff.shareTargetPicker([
      {
        type: 'text',
        text: `🃏 ${hostName} 開了一桌「${gameName}」！\n👉 點擊加入：${liffUrl}`,
      },
    ]);
    return result !== undefined;
  } catch (err) {
    console.error('[LIFF] shareTargetPicker failed:', err);
    return false;
  }
};

/**
 * Close LIFF window (only works inside LINE client)
 */
const closeLiff = () => {
  if (isInitialized.value && liff.isInClient()) {
    liff.closeWindow();
  }
};

export function useLiff() {
  return {
    isInitialized: readonly(isInitialized),
    isInLineClient: readonly(isInLineClient),
    isLoggedIn: readonly(isLoggedIn),
    lineProfile: readonly(lineProfile),
    liffError: readonly(liffError),
    initLiff,
    loginWithLiff,
    getAccessToken,
    fetchProfile,
    sendMessages,
    sendBuyInMessage,
    sendUndoMessage,
    sendSettlementMessage,
    shareGameInvite,
    closeLiff,
  };
}
