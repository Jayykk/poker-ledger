import { ref, computed } from 'vue';
import { useUserStore } from '../store/modules/user.js';

/**
 * Composable for daily settlement report.
 * Aggregates multiple game sessions within a date range,
 * produces player rankings (keyed by odId/uid), and allows
 * toggling individual games on/off.
 */
export function useDailyReport() {
  const userStore = useUserStore();

  // ── Date range (defaults to today 00:00 – 23:59) ──────────────
  const today = new Date();
  const startDate = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0));
  const endDate = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59));

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

  /** Unique key for a history entry (createdAt + gameName) */
  const gameKey = (h) => `${h.createdAt}_${h.gameName}`;

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

  const totalGames = computed(() => selectedGames.value.length);

  const totalBuyIn = computed(() =>
    selectedGames.value.reduce((sum, h) => {
      if (!h.settlement) return sum;
      // Find the current user's buyIn from settlement
      const me = h.settlement.find((p) => p.profit === h.profit);
      return sum + (me ? me.buyIn : 0);
    }, 0)
  );

  // ── Player ranking (across all selected games) ─────────────────

  const playerRanking = computed(() => {
    const map = new Map(); // key: odId or name → { odId, name, profit, games }

    for (const game of selectedGames.value) {
      if (!game.settlement) continue;
      for (const p of game.settlement) {
        // Use odId as primary key; fallback to name for legacy data
        const key = p.odId || p.name;
        if (!key) continue;

        const existing = map.get(key);
        if (existing) {
          existing.profit += p.profit || 0;
          existing.games += 1;
          // Prefer the name from the entry that has odId
          if (p.odId && !existing.odId) {
            existing.odId = p.odId;
          }
        } else {
          map.set(key, {
            odId: p.odId || null,
            name: p.name,
            profit: p.profit || 0,
            games: 1,
          });
        }
      }
    }

    return [...map.values()].sort((a, b) => b.profit - a.profit);
  });

  // ── Date helpers ───────────────────────────────────────────────

  const setDateRange = (start, end) => {
    startDate.value = start;
    endDate.value = end;
    // Reset game selection when date changes
    excludedGames.value = new Set();
  };

  const setToday = () => {
    const now = new Date();
    setDateRange(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    );
  };

  return {
    startDate,
    endDate,
    gamesInRange,
    selectedGames,
    excludedGames,
    toggleGame,
    isGameSelected,
    selectAll,
    deselectAll,
    totalProfit,
    totalGames,
    totalBuyIn,
    playerRanking,
    setDateRange,
    setToday,
    gameKey,
  };
}
