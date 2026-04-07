import { ref, computed } from 'vue';
import { useUserStore } from '../store/modules/user.js';
import { useAuthStore } from '../store/modules/auth.js';

/**
 * Composable for daily settlement report.
 * Aggregates multiple game sessions within a date range,
 * produces player rankings (keyed by odId/uid), and allows
 * toggling individual games on/off.
 */
export function useDailyReport() {
  const userStore = useUserStore();
  const authStore = useAuthStore();

  // ── Date range (defaults to today 00:00 – 23:59:59.999) ───────
  const today = new Date();
  const startDate = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0));
  const endDate = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999));

  // ── Per-game toggle (Set of createdAt timestamps used as identity) ──
  const excludedGames = ref(new Set());

  /** All games within the selected date range */
  const gamesInRange = computed(() => {
    const start = startDate.value.getTime();
    const end = endDate.value.getTime();

    return userStore.history.filter((h) => {
      const ts = typeof h.createdAt === 'number'
        ? h.createdAt
        : Date.parse(h.createdAt || h.date) || 0;
      return ts >= start && ts <= end;
    });
  });

  /** Unique key for a history entry */
  const gameKey = (h) => `${h.createdAt}_${h.gameId || ''}_${h.gameName}`;

  /** Games currently selected (all minus excluded) */
  const selectedGames = computed(() =>
    gamesInRange.value.filter((h) => !excludedGames.value.has(gameKey(h)))
  );

  /** Toggle a specific game on/off */
  const toggleGame = (game) => {
    const key = gameKey(game);
    const next = new Set(excludedGames.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    excludedGames.value = next;
  };

  /** Check if a game is currently selected */
  const isGameSelected = (game) => !excludedGames.value.has(gameKey(game));

  /** Select / deselect all */
  const selectAll = () => { excludedGames.value = new Set(); };
  const deselectAll = () => {
    excludedGames.value = new Set(gamesInRange.value.map(gameKey));
  };

  // ── Aggregated stats ───────────────────────────────────────────

  const totalProfit = computed(() =>
    selectedGames.value.reduce((sum, h) => sum + (h.profit || 0), 0)
  );

  /** Total profit converted to cash (chips / rate per game) */
  const totalProfitCash = computed(() =>
    selectedGames.value.reduce((sum, h) => sum + ((h.profit || 0) / (h.rate || 1)), 0)
  );

  const totalGames = computed(() => selectedGames.value.length);

  const totalBuyIn = computed(() => {
    const currentUid = authStore.user?.uid;
    return selectedGames.value.reduce((sum, h) => {
      if (!h.settlement) return sum;
      // Find the current user in settlement by uid, fallback to profit matching for legacy data
      const me = (currentUid && h.settlement.find((p) => p.odId === currentUid))
        || h.settlement.find((p) => p.profit === h.profit);
      return sum + (me ? me.buyIn : 0);
    }, 0);
  });

  /** Total buy-in converted to cash */
  const totalBuyInCash = computed(() => {
    const currentUid = authStore.user?.uid;
    return selectedGames.value.reduce((sum, h) => {
      if (!h.settlement) return sum;
      const rate = h.rate || 1;
      const me = (currentUid && h.settlement.find((p) => p.odId === currentUid))
        || h.settlement.find((p) => p.profit === h.profit);
      return sum + (me ? me.buyIn / rate : 0);
    }, 0);
  });

  // ── Per-game detail with cash values ───────────────────────────

  /** Selected games enriched with cash-converted values for current user */
  const selectedGamesWithCash = computed(() => {
    const currentUid = authStore.user?.uid;
    return selectedGames.value.map((h) => {
      const rate = h.rate || 1;
      const me = h.settlement
        && ((currentUid && h.settlement.find((p) => p.odId === currentUid))
          || h.settlement.find((p) => p.profit === h.profit));
      return {
        ...h,
        profitCash: (h.profit || 0) / rate,
        buyInCash: me ? me.buyIn / rate : 0,
        stackCash: me ? (me.stack || 0) / rate : 0,
      };
    });
  });

  // ── Player ranking (across all selected games, in cash) ────────

  const playerRanking = computed(() => {
    const map = new Map(); // key: odId or name → { odId, name, profitCash, games }

    for (const game of selectedGames.value) {
      if (!game.settlement) continue;
      const rate = game.rate || 1;
      for (const p of game.settlement) {
        // Use odId as primary key; fallback to name for legacy data
        const key = p.odId || p.name;
        if (!key) continue;

        const cashProfit = (p.profit || 0) / rate;
        const existing = map.get(key);
        if (existing) {
          existing.profitCash += cashProfit;
          existing.games += 1;
          if (p.odId && !existing.odId) {
            existing.odId = p.odId;
          }
        } else {
          map.set(key, {
            odId: p.odId || null,
            name: p.name,
            profitCash: cashProfit,
            games: 1,
          });
        }
      }
    }

    return [...map.values()].sort((a, b) => b.profitCash - a.profitCash);
  });

  /** Top 3 winners (profitCash > 0) */
  const topWinners = computed(() =>
    playerRanking.value.filter((p) => p.profitCash > 0).slice(0, 3)
  );

  /** Top 3 losers (profitCash < 0, sorted worst first) */
  const topLosers = computed(() =>
    playerRanking.value.filter((p) => p.profitCash < 0).slice(-3).reverse()
  );

  // ── Date helpers ───────────────────────────────────────────────

  const setDateRange = (start, end) => {
    // Swap if start is after end
    if (start.getTime() > end.getTime()) {
      [start, end] = [end, start];
    }
    startDate.value = start;
    endDate.value = end;
    // Reset game selection when date changes
    excludedGames.value = new Set();
  };

  const setToday = () => {
    const now = new Date();
    setDateRange(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    );
  };

  return {
    startDate,
    endDate,
    gamesInRange,
    selectedGames,
    selectedGamesWithCash,
    excludedGames,
    toggleGame,
    isGameSelected,
    selectAll,
    deselectAll,
    totalProfit,
    totalProfitCash,
    totalGames,
    totalBuyIn,
    totalBuyInCash,
    playerRanking,
    topWinners,
    topLosers,
    setDateRange,
    setToday,
    gameKey,
  };
}
