import { ref, readonly } from 'vue';
import liff from '@line/liff';
import { STORAGE_KEYS } from '../utils/constants.js';

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '';
// LINE Flex Message altText is limited; truncate settlement reports for the preview
const MAX_ALT_TEXT_LENGTH = 100;

const isInitialized = ref(false);
const isInLineClient = ref(false);
const isLoggedIn = ref(false);
const lineProfile = ref(null);
const liffError = ref('');

// LINE push notification flag (default: enabled)
const lineNotifyEnabled = ref(
  localStorage.getItem(STORAGE_KEYS.LINE_NOTIFY_ENABLED) !== 'false'
);

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
 * Build a Flex Message footer with a single URI action button
 */
const buildFooter = (uri, label) => ({
  type: 'box',
  layout: 'vertical',
  spacing: 'sm',
  contents: [
    {
      type: 'button',
      style: 'link',
      height: 'sm',
      action: {
        type: 'uri',
        label,
        uri,
      },
    },
  ],
  flex: 0,
});

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
 * Send a buy-in notification to the current LINE chat (Flex Message)
 */
const sendBuyInMessage = async (actionName, targetName, amount, roomName, gameId) => {
  if (!lineNotifyEnabled.value) return false;
  const isSelf = actionName === targetName;
  const roomLabel = roomName ? `${roomName} ` : '';
  const altText = isSelf
    ? `💰 ${roomLabel}${actionName} 買入了 $${amount}`
    : `💰 ${roomLabel}${actionName} 幫 ${targetName} 買入了 $${amount}`;
  const titleText = isSelf
    ? `${actionName} 自己買入`
    : `${actionName} 幫 ${targetName} 買入`;
  const notificationTitle = `💰 ${roomLabel}買入通知`;

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: notificationTitle,
          weight: 'bold',
          color: '#00B900',
          size: 'sm',
        },
        {
          type: 'text',
          text: titleText,
          weight: 'bold',
          size: 'xl',
          margin: 'md',
          wrap: true,
        },
        {
          type: 'text',
          text: `金額：$${amount}`,
          size: 'md',
          color: '#27ACB2',
          margin: 'md',
        },
      ],
    },
  };

  if (gameId && LIFF_ID) {
    bubble.footer = buildFooter(`https://liff.line.me/${LIFF_ID}/game/${gameId}`, '查看牌桌');
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send an undo notification to the current LINE chat (Flex Message)
 */
const sendUndoMessage = async (actionName, targetName, amount, roomName, gameId) => {
  if (!lineNotifyEnabled.value) return false;
  const roomLabel = roomName ? `${roomName} ` : '';
  const altText = `↩️ ${roomLabel}${actionName} 撤銷了 ${targetName} 的一筆 $${amount} 買入`;
  const notificationTitle = `↩️ ${roomLabel}撤銷通知`;

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: notificationTitle,
          weight: 'bold',
          color: '#FF4444',
          size: 'sm',
        },
        {
          type: 'text',
          text: `${actionName} 撤銷了 ${targetName} 的買入`,
          weight: 'bold',
          size: 'xl',
          margin: 'md',
          wrap: true,
        },
        {
          type: 'text',
          text: `撤銷金額：$${amount}`,
          size: 'md',
          color: '#FF4444',
          margin: 'md',
        },
      ],
    },
  };

  if (gameId && LIFF_ID) {
    bubble.footer = buildFooter(`https://liff.line.me/${LIFF_ID}/game/${gameId}`, '查看牌桌');
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send settlement report to the current LINE chat (Flex Message)
 */
const sendSettlementMessage = async (reportText, gameId) => {
  if (!lineNotifyEnabled.value) return false;
  const altText = `🎲 結算報表\n${reportText.slice(0, MAX_ALT_TEXT_LENGTH)}`;

  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '🎲 結算報表',
          weight: 'bold',
          color: '#1DB446',
          size: 'sm',
        },
        {
          type: 'text',
          text: reportText,
          size: 'sm',
          color: '#555555',
          margin: 'md',
          wrap: true,
        },
      ],
    },
  };

  if (gameId && LIFF_ID) {
    bubble.footer = buildFooter(`https://liff.line.me/${LIFF_ID}/report/${gameId}`, '查看結算');
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send daily report summary to the current LINE chat (Flex Message)
 * @param {{ dateLabel: string, totalProfit: number, totalGames: number, totalBuyIn: number, ranking: Array }} data
 */
const sendDailyReportMessage = async ({ dateLabel, totalProfit, totalGames, totalBuyIn, ranking }) => {
  if (!lineNotifyEnabled.value) return false;

  const isProfit = totalProfit >= 0;
  const profitText = `${isProfit ? '+' : ''}${totalProfit.toLocaleString()}`;
  const headerColor = isProfit ? '#1DB446' : '#FF4444';
  const altText = `📊 日結報表 ${dateLabel}\n總盈虧: ${profitText}`;

  // Build ranking rows
  const rankingContents = (ranking || []).map((p, i) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${i + 1}. ${p.name}`, size: 'sm', color: '#555555', flex: 3 },
      {
        type: 'text',
        text: `${p.profit > 0 ? '+' : ''}${p.profit.toLocaleString()}`,
        size: 'sm',
        color: p.profit >= 0 ? '#1DB446' : '#FF4444',
        align: 'end',
        flex: 2,
      },
    ],
  }));

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerColor,
      contents: [
        { type: 'text', text: '📊 日結報表', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: dateLabel, color: '#FFFFFFCC', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Summary row
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                { type: 'text', text: '總盈虧', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: profitText, size: 'xl', weight: 'bold', color: isProfit ? '#1DB446' : '#FF4444' },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                { type: 'text', text: '場次', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: String(totalGames), size: 'xl', weight: 'bold', color: '#333333' },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                { type: 'text', text: '總買入', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: totalBuyIn.toLocaleString(), size: 'lg', weight: 'bold', color: '#FF8C00' },
              ],
            },
          ],
        },
        // Separator
        { type: 'separator', color: '#EEEEEE' },
        // Ranking title
        ...(rankingContents.length > 0
          ? [
              { type: 'text', text: '🏆 排行榜', weight: 'bold', size: 'sm', color: '#333333' },
              ...rankingContents,
            ]
          : []),
      ],
    },
  };

  if (LIFF_ID) {
    bubble.footer = buildFooter(`https://liff.line.me/${LIFF_ID}/daily-report`, '查看詳情');
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
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

/**
 * Toggle LINE push notification on/off
 */
const toggleLineNotify = () => {
  lineNotifyEnabled.value = !lineNotifyEnabled.value;
  localStorage.setItem(STORAGE_KEYS.LINE_NOTIFY_ENABLED, String(lineNotifyEnabled.value));
};

export function useLiff() {
  return {
    isInitialized: readonly(isInitialized),
    isInLineClient: readonly(isInLineClient),
    isLoggedIn: readonly(isLoggedIn),
    lineProfile: readonly(lineProfile),
    liffError: readonly(liffError),
    lineNotifyEnabled: readonly(lineNotifyEnabled),
    initLiff,
    loginWithLiff,
    getAccessToken,
    fetchProfile,
    sendMessages,
    sendBuyInMessage,
    sendUndoMessage,
    sendSettlementMessage,
    sendDailyReportMessage,
    shareGameInvite,
    closeLiff,
    toggleLineNotify,
  };
}
