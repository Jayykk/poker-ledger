import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuthStore } from './auth.js';
import { formatDate } from '../../utils/formatters.js';

export const useUserStore = defineStore('user', () => {
  const authStore = useAuthStore();
  
  const history = ref([]);
  const stats = ref({
    games: 0,
    totalProfit: 0,
    winRate: 0
  });
  
  let unsubscribeUser = null;

  const sortedHistory = computed(() => {
    return [...history.value].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
  });

  const formattedHistory = computed(() => {
    return history.value.map(h => ({
      ...h,
      dateStr: formatDate(h.date)
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
    }
    
    // Subscribe to user document
    unsubscribeUser = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let rawHistory = data.history || [];
        
        // Sort by date
        rawHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Set history
        history.value = rawHistory;
        
        // Calculate stats
        const totalProfit = rawHistory.reduce((sum, h) => 
          sum + (h.profit / (h.rate || 1)), 0
        );
        
        const wins = rawHistory.filter(h => h.profit > 0).length;
        
        stats.value = {
          games: rawHistory.length,
          totalProfit: Math.round(totalProfit),
          winRate: rawHistory.length ? Math.round((wins / rawHistory.length) * 100) : 0
        };
      } else {
        // No user data yet
        history.value = [];
        stats.value = { games: 0, totalProfit: 0, winRate: 0 };
      }
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
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        return history.value;
    }
    
    return history.value.filter(h => new Date(h.date) >= startDate);
  };

  /**
   * Get stats for a specific time period
   */
  const getStatsByPeriod = (period = 'all') => {
    const periodHistory = getHistoryByPeriod(period);
    
    const totalProfit = periodHistory.reduce((sum, h) => 
      sum + (h.profit / (h.rate || 1)), 0
    );
    
    const wins = periodHistory.filter(h => h.profit > 0).length;
    
    return {
      games: periodHistory.length,
      totalProfit: Math.round(totalProfit),
      winRate: periodHistory.length ? Math.round((wins / periodHistory.length) * 100) : 0
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
  };

  return {
    history,
    stats,
    sortedHistory,
    formattedHistory,
    loadUserData,
    getHistoryByPeriod,
    getStatsByPeriod,
    cleanup
  };
});
