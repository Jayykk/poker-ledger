import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { 
  collection, 
  doc, 
  addDoc, 
  deleteDoc, 
  getDocs,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase-init.js';

export const useHandStore = defineStore('hand', () => {
  const hands = ref([]);
  const loading = ref(false);
  const error = ref('');
  
  let unsubscribeHands = null;

  /**
   * Create a hand record
   */
  const createHandRecord = async (gameId, handData) => {
    loading.value = true;
    error.value = '';
    
    try {
      const handsRef = collection(db, 'games', gameId, 'hands');
      const docRef = await addDoc(handsRef, {
        ...handData,
        createdAt: Date.now()
      });
      
      return docRef.id;
    } catch (err) {
      console.error('Create hand record error:', err);
      error.value = 'Failed to create hand record: ' + err.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Load hand records for a game
   */
  const loadHandRecords = async (gameId) => {
    loading.value = true;
    error.value = '';
    
    try {
      const handsRef = collection(db, 'games', gameId, 'hands');
      const q = query(handsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      hands.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      console.error('Load hand records error:', err);
      error.value = 'Failed to load hand records: ' + err.message;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Listen to hand records (realtime)
   */
  const listenToHandRecords = (gameId) => {
    if (unsubscribeHands) {
      unsubscribeHands();
    }
    
    const handsRef = collection(db, 'games', gameId, 'hands');
    const q = query(handsRef, orderBy('createdAt', 'desc'));
    
    unsubscribeHands = onSnapshot(q, (snapshot) => {
      hands.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    });
  };

  /**
   * Delete a hand record
   */
  const deleteHandRecord = async (gameId, handId) => {
    loading.value = true;
    error.value = '';
    
    try {
      await deleteDoc(doc(db, 'games', gameId, 'hands', handId));
      return true;
    } catch (err) {
      console.error('Delete hand record error:', err);
      error.value = 'Failed to delete hand record: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Cleanup (unsubscribe from listeners)
   */
  const cleanup = () => {
    if (unsubscribeHands) {
      unsubscribeHands();
      unsubscribeHands = null;
    }
    hands.value = [];
  };

  return {
    hands,
    loading,
    error,
    createHandRecord,
    loadHandRecords,
    listenToHandRecords,
    deleteHandRecord,
    cleanup
  };
});
