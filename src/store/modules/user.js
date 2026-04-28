import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuthStore } from './auth.js';
import { formatDate } from '../../utils/formatters.js';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return 0;
}

function normalizeHistoryRecord(record, source, fallbackKey) {
  const createdAt = toMillis(record.createdAt) || toMillis(record.completedAt) || toMillis(record.date);
  const date = record.date || new Date(createdAt || Date.now()).toISOString();

  return {
    ...record,
    gameId: record.gameId || fallbackKey,
    createdAt,
    date,
    historySource: source,
  };
}

function getRecordKey(record, fallbackKey) {
  return record.gameId || fallbackKey;
}

export const useUserStore = defineStore('user', () => {
  const authStore = useAuthStore();

  const history = ref([]);
  const legacyHistory = ref([]);
  const projectedHistory = ref([]);
  const stats = ref({
    games: 0,
    totalProfit: 0,
    winRate: 0
  });

  let unsubscribeUser = null;
  let unsubscribeHistorySub = null;
  const pendingSyncWaiters = new Set();

  const resolvePendingSyncWaiters = () => {
    for (const waiter of pendingSyncWaiters) {
      const matchedRecord = projectedHistory.value.find(
        (record) => record.gameId === waiter.gameId && record.syncToken === waiter.syncToken
      );

      if (!matchedRecord) continue;

      pendingSyncWaiters.delete(waiter);
      waiter.cleanup?.();
      waiter.resolve({ source: 'history_sub', record: matchedRecord });
    }
  };

  const rebuildMergedHistory = () => {
    const merged = new Map();

    legacyHistory.value.forEach((record, index) => {
      merged.set(getRecordKey(record, `legacy-${index}`), record);
    });

    projectedHistory.value.forEach((record, index) => {
      merged.set(getRecordKey(record, `history_sub-${index}`), record);
    });

    const nextHistory = Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    history.value = nextHistory;
    resolvePendingSyncWaiters();

    const totalProfit = nextHistory.reduce((sum, item) => sum + ((item.profit || 0) / (item.rate || 1)), 0);
    const wins = nextHistory.filter((item) => (item.profit || 0) > 0).length;

    stats.value = {
      games: nextHistory.length,
      totalProfit: Math.round(totalProfit),
      winRate: nextHistory.length ? Math.round((wins / nextHistory.length) * 100) : 0,
    };
  };

  const sortedHistory = computed(() => {
    return [...history.value].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  });

  const formattedHistory = computed(() => {
    return history.value.map((h) => ({
      ...h,
      dateStr: formatDate(h.createdAt || h.date),
    }));
  });

  /**
   * Load user data from Firestore
   */
  const loadUserData = async (uid = null) => {
    const userId = uid || authStore.user?.uid;
    if (!userId) return;

    // Cleanup previous listener
    if (unsubscribeUser) {
      unsubscribeUser();
      unsubscribeUser = null;
    }

    if (unsubscribeHistorySub) {
      unsubscribeHistorySub();
      unsubscribeHistorySub = null;
    }

    // Subscribe to user document
    unsubscribeUser = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawHistory = Array.isArray(data.history) ? data.history : [];

        legacyHistory.value = rawHistory.map((record, index) =>
          normalizeHistoryRecord(record, 'legacy', `legacy-${index}`)
        );
        rebuildMergedHistory();
      } else {
        legacyHistory.value = [];
        rebuildMergedHistory();
      }
    });

    const historySubQuery = query(
      collection(db, 'users', userId, 'history_sub'),
      orderBy('projectionUpdatedAt', 'desc'),
      limit(50)
    );

    unsubscribeHistorySub = onSnapshot(historySubQuery, (snapshot) => {
      projectedHistory.value = snapshot.docs.map((docSnap) =>
        normalizeHistoryRecord({ gameId: docSnap.id, ...docSnap.data() }, 'history_sub', docSnap.id)
      );
      rebuildMergedHistory();
    });
  };

  const waitForHistorySync = async (gameId, syncToken, options = {}) => {
    const {
      timeoutMs = 15000,
      fallbackToGameProjection = false,
    } = options;

    if (!gameId || !syncToken) {
      return { source: 'skipped', record: null };
    }

    const immediateMatch = projectedHistory.value.find(
      (record) => record.gameId === gameId && record.syncToken === syncToken
    );
    if (immediateMatch) {
      return { source: 'history_sub', record: immediateMatch };
    }

    return new Promise((resolve) => {
      const waiter = {
        gameId,
        syncToken,
        resolve,
      };

      const timeoutId = window.setTimeout(() => {
        pendingSyncWaiters.delete(waiter);
        waiter.cleanup?.();
        resolve({ source: 'timeout', record: null });
      }, timeoutMs);

      let unsubscribeGameAck = null;
      if (fallbackToGameProjection) {
        unsubscribeGameAck = onSnapshot(doc(db, 'games', gameId), (snap) => {
          const ackToken = snap.data()?.historyProjection?.lastSyncRequestToken;
          if (ackToken !== syncToken) return;

          pendingSyncWaiters.delete(waiter);
          waiter.cleanup?.();
          resolve({ source: 'game_projection', record: null });
        });
      }

      waiter.cleanup = () => {
        window.clearTimeout(timeoutId);
        if (unsubscribeGameAck) {
          unsubscribeGameAck();
          unsubscribeGameAck = null;
        }
      };

      pendingSyncWaiters.add(waiter);
    });
  };

  /**
   * Get history filtered by time period
   */
  const getHistoryByPeriod = (period = 'all') => {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        return history.value;
    }

    return history.value.filter((h) => (h.createdAt || 0) >= startDate.getTime());
  };

  /**
   * Get stats for a specific time period
   */
  const getStatsByPeriod = (period = 'all') => {
    const periodHistory = getHistoryByPeriod(period);

    const totalProfit = periodHistory.reduce((sum, h) => sum + ((h.profit || 0) / (h.rate || 1)), 0);
    const wins = periodHistory.filter((h) => (h.profit || 0) > 0).length;

    return {
      games: periodHistory.length,
      totalProfit: Math.round(totalProfit),
      winRate: periodHistory.length ? Math.round((wins / periodHistory.length) * 100) : 0,
    };
  };

  /**
   * Cleanup (unsubscribe from listeners)
   */
  const cleanup = () => {
    if (unsubscribeUser) {
      unsubscribeUser();
      unsubscribeUser = null;
    }

    if (unsubscribeHistorySub) {
      unsubscribeHistorySub();
      unsubscribeHistorySub = null;
    }
  };

  return {
    history,
    stats,
    sortedHistory,
    formattedHistory,
    loadUserData,
    waitForHistorySync,
    getHistoryByPeriod,
    getStatsByPeriod,
    cleanup,
  };
});
