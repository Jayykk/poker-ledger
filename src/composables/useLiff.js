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

const truncateAltText = (text) => {
  if (!text) return '';
  if (text.length <= MAX_ALT_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_ALT_TEXT_LENGTH - 1)}...`;
};

const formatMoney = (amount) => `$${Math.round(Number(amount) || 0).toLocaleString()}`;

const formatSignedMoney = (amount) => {
  const rounded = Math.round(Number(amount) || 0);
  const absText = formatMoney(Math.abs(rounded));
  if (rounded > 0) return `+${absText}`;
  if (rounded < 0) return `-${absText}`;
  return absText;
};

const getTournamentPlacementTheme = (placement) => {
  switch (placement) {
    case 1:
      return {
        emoji: '🥇',
        label: '冠軍',
        backgroundColor: '#FFF7D6',
        labelColor: '#B7791F',
      };
    case 2:
      return {
        emoji: '🥈',
        label: '亞軍',
        backgroundColor: '#F8FAFC',
        labelColor: '#64748B',
      };
    case 3:
      return {
        emoji: '🥉',
        label: '季軍',
        backgroundColor: '#FFF1E6',
        labelColor: '#C2410C',
      };
    default:
      return {
        emoji: '🎯',
        label: placement ? `第 ${placement} 名` : '名次未定',
        backgroundColor: '#F8FAFC',
        labelColor: '#475569',
      };
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
 * Send a buy-in notification to the current LINE chat (Flex Message).
 * One-line layout: "小明 買入  by 小華". Tiered by buy-in groups.
 * Entire bubble is tappable (no separate footer button).
 */
const sendBuyInMessage = async (actionName, targetName, amount, roomName, gameId, { totalBuyIn = 0, baseBuyIn = 0, gameType = 'live' } = {}) => {
  if (!lineNotifyEnabled.value) return false;
  const isTournament = gameType === 'tournament';
  const isSelf = actionName === targetName;
  const roomLabel = roomName || '';
  const numAmount = Number(amount) || 0;
  const numTotal = Number(totalBuyIn) || numAmount;
  const numBase = Number(baseBuyIn) || numAmount;
  const buyCount = numBase > 0 ? Math.round(numTotal / numBase) : 1;
  const altText = isSelf
    ? `💰 ${targetName} 買入 $${numAmount.toLocaleString()}`
    : `💰 ${targetName} 買入 $${numAmount.toLocaleString()} (by ${actionName})`;

  // Tiered visuals based on buy-in groups
  let headerEmoji = isTournament ? '🏆' : '💰';
  let headerColor = '#1DB446';
  let amountColor = '#1DB446';

  if (buyCount >= 5) {
    headerEmoji = '🚀🔥';
    headerColor = '#DC143C';
    amountColor = '#DC143C';
  } else if (buyCount >= 3) {
    headerEmoji = '💎';
    headerColor = '#FF8C00';
    amountColor = '#FF8C00';
  }

  // Name row: "小明 買入" (bold) + "by 小華" (small, red-ish) on same line
  const nameRowContents = [
    { type: 'text', text: `${targetName} 買入`, weight: 'bold', size: 'lg', color: '#333333', flex: 0 },
  ];
  if (!isSelf) {
    nameRowContents.push(
      { type: 'text', text: `by ${actionName}`, size: 'xs', color: '#E06666', align: 'end', gravity: 'bottom', flex: 0, margin: 'md' },
    );
  }

  // Tournament: "買入 $xxx" + "已買入 N 次"; Cash: "籌碼 $xxx" + "已買入 N 組"
  const amountLabel = isTournament ? `買入 $${numAmount.toLocaleString()}` : `籌碼 $${numAmount.toLocaleString()}`;
  const countUnit = isTournament ? '次' : '組';
  const countLabel = `已買入 ${buyCount} ${countUnit} $${numTotal.toLocaleString()}`;

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: nameRowContents,
    },
    { type: 'separator', color: '#EEEEEE', margin: 'lg' },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'lg',
      contents: [
        { type: 'text', text: amountLabel, size: 'lg', weight: 'bold', color: amountColor, flex: 0 },
        { type: 'text', text: countLabel, size: 'xs', color: '#999999', align: 'end', gravity: 'bottom', flex: 0, margin: 'md' },
      ],
    },
  ];

  const liffPath = isTournament ? `tournament-game/${gameId}` : `game/${gameId}`;
  const liffUrl = gameId && LIFF_ID ? `https://liff.line.me/${LIFF_ID}/${liffPath}` : undefined;

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerColor,
      contents: [
        { type: 'text', text: `${headerEmoji} ${roomLabel ? roomLabel + ' ' : ''}買入通知`, color: '#FFFFFF', weight: 'bold', size: 'md' },
      ],
      ...(liffUrl ? { action: { type: 'uri', label: '查看牌桌', uri: liffUrl } } : {}),
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      ...(liffUrl ? { action: { type: 'uri', label: '查看牌桌', uri: liffUrl } } : {}),
    },
  };

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send an undo notification to the current LINE chat (Flex Message).
 * One-line layout matching buy-in. Entire bubble tappable.
 */
const sendUndoMessage = async (actionName, targetName, amount, roomName, gameId, { totalBuyIn = 0, baseBuyIn = 0, gameType = 'live' } = {}) => {
  if (!lineNotifyEnabled.value) return false;
  const isTournament = gameType === 'tournament';
  const roomLabel = roomName || '';
  const isSelf = actionName === targetName;
  const numAmount = Number(amount) || 0;
  const numTotal = Number(totalBuyIn) || 0;
  const numBase = Number(baseBuyIn) || numAmount;
  const buyCount = numBase > 0 ? Math.round(numTotal / numBase) : 0;
  const countUnit = isTournament ? '次' : '組';
  const altText = `↩️ ${targetName} 撤銷買入 $${numAmount.toLocaleString()}`;

  const nameRowContents = [
    { type: 'text', text: `${targetName} 撤銷買入`, weight: 'bold', size: 'lg', color: '#333333', flex: 0 },
  ];
  if (!isSelf) {
    nameRowContents.push(
      { type: 'text', text: `by ${actionName}`, size: 'xs', color: '#E06666', align: 'end', gravity: 'bottom', flex: 0, margin: 'md' },
    );
  }

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: nameRowContents,
    },
    { type: 'separator', color: '#EEEEEE', margin: 'lg' },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'lg',
      contents: [
        { type: 'text', text: `-$${numAmount.toLocaleString()}`, size: 'lg', weight: 'bold', color: '#FF4444', flex: 0 },
        ...(numTotal > 0 ? [{ type: 'text', text: `剩餘 ${buyCount} ${countUnit} $${numTotal.toLocaleString()}`, size: 'xs', color: '#999999', align: 'end', gravity: 'bottom', flex: 0, margin: 'md' }] : []),
      ],
    },
  ];

  const liffPath = isTournament ? `tournament-game/${gameId}` : `game/${gameId}`;
  const liffUrl = gameId && LIFF_ID ? `https://liff.line.me/${LIFF_ID}/${liffPath}` : undefined;

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FF4444',
      contents: [
        { type: 'text', text: `↩️ ${roomLabel ? roomLabel + ' ' : ''}撤銷通知`, color: '#FFFFFF', weight: 'bold', size: 'md' },
      ],
      ...(liffUrl ? { action: { type: 'uri', label: '查看牌桌', uri: liffUrl } } : {}),
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      ...(liffUrl ? { action: { type: 'uri', label: '查看牌桌', uri: liffUrl } } : {}),
    },
  };

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send single-game settlement report to the current LINE chat (Flex Message).
 * Structured layout matching daily settlement style.
 */
const sendSettlementMessage = async ({ gameName, gameId, rate, players }) => {
  if (!lineNotifyEnabled.value) return false;

  const totalBuyInCash = Math.round((players || []).reduce((s, p) => s + p.buyIn, 0) / (rate || 1));
  const altText = `🎲 結算報表 — ${gameName || '未命名'}`;

  const rateLabel = rate && rate !== 1 ? ` (1:${rate})` : '';

  // Player rows sorted by profit descending
  const sorted = [...(players || [])].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  const playerRows = sorted.slice(0, 20).map((p) => {
    const cash = Math.round((p.profit ?? 0) / (rate || 1));
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: p.name || '???', size: 'sm', color: '#555555', flex: 3 },
        {
          type: 'text',
          text: `${cash > 0 ? '+' : ''}$${cash.toLocaleString()}`,
          size: 'sm',
          color: cash >= 0 ? '#1DB446' : '#FF4444',
          align: 'end',
          flex: 2,
          weight: 'bold',
        },
      ],
    };
  });

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1DB446',
      contents: [
        { type: 'text', text: '🎲 結算報表', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: `${gameName || '未命名'}${rateLabel}`, color: '#FFFFFFCC', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Summary
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box', layout: 'vertical', flex: 1,
              contents: [
                { type: 'text', text: '人數', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: String(players?.length || 0), size: 'xxl', weight: 'bold', color: '#333333' },
              ],
            },
            {
              type: 'box', layout: 'vertical', flex: 1,
              contents: [
                { type: 'text', text: '總買入', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: `$${totalBuyInCash.toLocaleString()}`, size: 'xxl', weight: 'bold', color: '#333333' },
              ],
            },
          ],
        },
        { type: 'separator', color: '#EEEEEE' },
        // Player settlement
        { type: 'text', text: '📊 結算統計', weight: 'bold', size: 'sm', color: '#333333' },
        ...playerRows,
      ],
    },
  };

  if (gameId && LIFF_ID) {
    const liffUrl = `https://liff.line.me/${LIFF_ID}/report/${gameId}`;
    bubble.body.action = { type: 'uri', label: '查看結算', uri: liffUrl };
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send tournament settlement report to the current LINE chat (Flex Message).
 * Tournament-first layout: prize pool, champion, placements, buy-ins, and profit.
 */
const sendTournamentSettlementMessage = async ({ gameName, gameId, players }) => {
  if (!lineNotifyEnabled.value) return false;

  const sorted = [...(players || [])]
    .filter((p) => p)
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));

  if (sorted.length === 0) return false;

  const champion = sorted.find((p) => p.placement === 1) || sorted[0];
  const totalPrizePool = sorted.reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const altText = truncateAltText(`🏆 錦標賽結算 — ${gameName || '未命名'} 冠軍：${champion?.name || '未定'}`);
  const liffUrl = gameId && LIFF_ID ? `https://liff.line.me/${LIFF_ID}/report/${gameId}` : undefined;

  const placementRows = sorted.slice(0, 20).map((player) => {
    const theme = getTournamentPlacementTheme(player.placement);
    const profitText = formatSignedMoney(player.profit || 0);
    const profitColor = (player.profit || 0) >= 0 ? '#0F9D58' : '#E11D48';

    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: 'md',
      paddingAll: '12px',
      backgroundColor: theme.backgroundColor,
      cornerRadius: '12px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: theme.emoji, size: 'lg', flex: 0 },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: `#${player.placement || '-'} ${player.name || '???'}`,
                  size: 'sm',
                  weight: 'bold',
                  color: '#1F2937',
                  wrap: true,
                },
                {
                  type: 'text',
                  text: theme.label,
                  size: 'xs',
                  color: theme.labelColor,
                  weight: 'bold',
                  margin: 'sm',
                },
              ],
            },
            {
              type: 'text',
              text: profitText,
              size: 'sm',
              weight: 'bold',
              color: profitColor,
              align: 'end',
              flex: 0,
            },
          ],
        },
        {
          type: 'text',
          text: `獎金 ${formatMoney(player.prize)} ｜ 買入 ${formatMoney(player.buyIn)} ｜ 淨利 ${profitText}`,
          size: 'xs',
          color: '#6B7280',
          wrap: true,
        },
      ],
    };
  });

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#A16207',
      contents: [
        { type: 'text', text: '🏆 錦標賽結算', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: gameName || '未命名', color: '#FEF3C7', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                { type: 'text', text: '獎池', size: 'xs', color: '#9CA3AF' },
                { type: 'text', text: formatMoney(totalPrizePool), size: 'xxl', weight: 'bold', color: '#1F2937' },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                { type: 'text', text: '參賽', size: 'xs', color: '#9CA3AF' },
                { type: 'text', text: `${sorted.length} 人`, size: 'xxl', weight: 'bold', color: '#1F2937' },
              ],
            },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '12px',
          backgroundColor: '#FFF7D6',
          cornerRadius: '12px',
          contents: [
            { type: 'text', text: '👑 冠軍', size: 'xs', color: '#B7791F', weight: 'bold' },
            { type: 'text', text: champion?.name || '未定', size: 'xl', color: '#92400E', weight: 'bold', margin: 'sm' },
            { type: 'text', text: `淨利 ${formatSignedMoney(champion?.profit || 0)}`, size: 'xs', color: '#B45309', margin: 'sm' },
          ],
        },
        { type: 'separator', color: '#EEEEEE' },
        { type: 'text', text: '🏅 名次結果', weight: 'bold', size: 'sm', color: '#333333' },
        ...placementRows,
      ],
    },
    ...(liffUrl ? { footer: buildFooter(liffUrl, '查看結算') } : {}),
  };

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send daily settlement report to the current LINE chat (Flex Message).
 * Public-friendly layout: summary → game names → all players ranked by P&L.
 */
const sendDailySettlementMessage = async ({ dateLabel, startDateStr, endDateStr, totalGames, totalBuyInAllCash, games, playerRanking }) => {
  if (!lineNotifyEnabled.value) return false;

  const altText = `💰 日結結算 ${dateLabel}`;
  const dateQuery = startDateStr && endDateStr ? `?start=${startDateStr}&end=${endDateStr}` : '';
  const buyInText = `$${Math.round(totalBuyInAllCash).toLocaleString()}`;

  // Game name rows (max 10)
  const gameNameRows = (games || []).slice(0, 10).map((g) => {
    const rate = g.rate || 1;
    const rateLabel = rate !== 1 ? ` (1:${rate})` : '';
    return {
      type: 'text',
      text: `${g.gameName || '未命名'}${rateLabel}`,
      size: 'sm',
      color: '#555555',
    };
  });

  // Player settlement rows (all players, max 20)
  const playerRows = (playerRanking || []).slice(0, 20).map((p) => {
    const cash = Math.round(p.profitCash);
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: p.name || '???', size: 'sm', color: '#555555', flex: 3 },
        {
          type: 'text',
          text: `${cash > 0 ? '+' : ''}$${cash.toLocaleString()}`,
          size: 'sm',
          color: cash >= 0 ? '#1DB446' : '#FF4444',
          align: 'end',
          flex: 2,
          weight: 'bold',
        },
      ],
    };
  });

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1DB446',
      contents: [
        { type: 'text', text: '💰 日結結算', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: dateLabel, color: '#FFFFFFCC', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        // Summary: 場次 + 總買入
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box', layout: 'vertical', flex: 1,
              contents: [
                { type: 'text', text: '場次', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: String(totalGames), size: 'xxl', weight: 'bold', color: '#333333' },
              ],
            },
            {
              type: 'box', layout: 'vertical', flex: 1,
              contents: [
                { type: 'text', text: '總買入', size: 'xs', color: '#AAAAAA' },
                { type: 'text', text: buyInText, size: 'xxl', weight: 'bold', color: '#333333' },
              ],
            },
          ],
        },
        // Separator
        { type: 'separator', color: '#EEEEEE' },
        // Game names
        { type: 'text', text: '📋 場次名稱', weight: 'bold', size: 'sm', color: '#333333' },
        ...gameNameRows,
        // Separator
        { type: 'separator', color: '#EEEEEE' },
        // All players settlement
        { type: 'text', text: '📊 結算統計', weight: 'bold', size: 'sm', color: '#333333' },
        ...playerRows,
      ],
    },
  };

  if (LIFF_ID) {
    const liffUrl = `https://liff.line.me/${LIFF_ID}/daily-report${dateQuery}`;
    bubble.body.action = { type: 'uri', label: '查看詳情', uri: liffUrl };
  }

  return sendMessages([{ type: 'flex', altText, contents: bubble }]);
};

/**
 * Send daily ranking to the current LINE chat (Flex Message).
 * Shows top 3 winners and top 3 losers.
 */
const sendDailyRankingMessage = async ({ dateLabel, startDateStr, endDateStr, topWinners, topLosers }) => {
  if (!lineNotifyEnabled.value) return false;

  const altText = `🏆 日結排行 ${dateLabel}`;
  const dateQuery = startDateStr && endDateStr ? `?start=${startDateStr}&end=${endDateStr}` : '';

  const buildPlayerRow = (p, i, emoji) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${emoji} ${p.name}`, size: 'sm', color: '#555555', flex: 3 },
      {
        type: 'text',
        text: `${p.profitCash > 0 ? '+' : ''}$${Math.round(p.profitCash).toLocaleString()}`,
        size: 'sm',
        color: p.profitCash >= 0 ? '#1DB446' : '#FF4444',
        align: 'end',
        flex: 2,
      },
    ],
  });

  const medalEmojis = ['🥇', '🥈', '🥉'];
  const winnerRows = (topWinners || []).map((p, i) => buildPlayerRow(p, i, medalEmojis[i] || `${i + 1}.`));
  const loserRows = (topLosers || []).map((p, i) => buildPlayerRow(p, i, `💸`));

  const bodyContents = [];

  if (winnerRows.length > 0) {
    bodyContents.push(
      { type: 'text', text: '🏆 最大贏家', weight: 'bold', size: 'sm', color: '#1DB446' },
      ...winnerRows,
    );
  }

  if (loserRows.length > 0) {
    if (winnerRows.length > 0) bodyContents.push({ type: 'separator', color: '#EEEEEE', margin: 'md' });
    bodyContents.push(
      { type: 'text', text: '💸 最大輸家', weight: 'bold', size: 'sm', color: '#FF4444', margin: winnerRows.length > 0 ? 'md' : 'none' },
      ...loserRows,
    );
  }

  if (bodyContents.length === 0) {
    bodyContents.push({ type: 'text', text: '暫無排行資料', size: 'sm', color: '#AAAAAA' });
  }

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FF8C00',
      contents: [
        { type: 'text', text: '🏆 日結排行', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: dateLabel, color: '#FFFFFFCC', size: 'xs', margin: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: bodyContents,
    },
  };

  if (LIFF_ID) {
    const liffUrl = `https://liff.line.me/${LIFF_ID}/daily-report${dateQuery}`;
    bubble.body.action = { type: 'uri', label: '查看詳情', uri: liffUrl };
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
    sendTournamentSettlementMessage,
    sendDailySettlementMessage,
    sendDailyRankingMessage,
    shareGameInvite,
    closeLiff,
    toggleLineNotify,
  };
}
