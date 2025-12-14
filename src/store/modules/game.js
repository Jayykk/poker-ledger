import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  getDocs,
  query,
  where,
  arrayUnion, 
  runTransaction,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuthStore } from './auth.js';
import { useUserStore } from './user.js';
import { GAME_STATUS, DEFAULT_BUY_IN, STORAGE_KEYS } from '../../utils/constants.js';

export const useGameStore = defineStore('game', () => {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  
  const game = ref(null);
  const gameId = ref(null);
  const myRooms = ref([]);
  const loading = ref(false);
  const error = ref('');
  
  let unsubscribeGame = null;

  const isInGame = computed(() => !!game.value);
  const isHost = computed(() => game.value?.hostUid === authStore.user?.uid);
  const myPlayer = computed(() => 
    game.value?.players.find(p => p.uid === authStore.user?.uid)
  );
  const totalPot = computed(() => 
    game.value?.players.reduce((sum, p) => sum + p.buyIn, 0) || 0
  );
  const totalStack = computed(() => 
    game.value?.players.reduce((sum, p) => sum + (p.stack || 0), 0) || 0
  );
  const gap = computed(() => totalStack.value - totalPot.value);

  /**
   * Create a new game
   */
  const createGame = async (name) => {
    if (!authStore.user) return null;
    
    loading.value = true;
    error.value = '';
    
    try {
      const hostName = authStore.displayName;
      const docRef = await addDoc(collection(db, 'games'), {
        name: name || 'Poker Game',
        roomCode: Math.floor(1000 + Math.random() * 9000).toString(),
        hostUid: authStore.user.uid,
        hostName,
        status: GAME_STATUS.ACTIVE,
        createdAt: Date.now(),
        players: [{
          id: Date.now().toString(),
          name: hostName,
          uid: authStore.user.uid,
          buyIn: DEFAULT_BUY_IN,
          stack: 0
        }]
      });
      
      await joinGameListener(docRef.id);
      return docRef.id;
    } catch (err) {
      console.error('Create game error:', err);
      error.value = 'Failed to create game: ' + err.message;
      return null;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Join game listener (realtime updates)
   */
  const joinGameListener = async (id) => {
    if (unsubscribeGame) {
      unsubscribeGame();
    }
    
    unsubscribeGame = onSnapshot(doc(db, 'games', id), (snap) => {
      if (snap.exists() && snap.data().status === GAME_STATUS.ACTIVE) {
        game.value = { id: snap.id, ...snap.data() };
        gameId.value = snap.id;
        localStorage.setItem(STORAGE_KEYS.LAST_GAME_ID, id);
      } else {
        game.value = null;
        gameId.value = null;
        localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
      }
    });
  };

  /**
   * Check game status
   */
  const checkGameStatus = async (id) => {
    loading.value = true;
    try {
      const docRef = doc(db, 'games', id);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        return { status: 'error', msg: 'Game not found' };
      }
      
      if (snap.data().status !== GAME_STATUS.ACTIVE) {
        return { status: 'error', msg: 'Game has ended' };
      }
      
      const players = snap.data().players || [];
      const amIIn = players.some(p => p.uid === authStore.user?.uid);
      
      if (amIIn) {
        return { status: 'joined' };
      }
      
      const unboundPlayers = players.filter(p => !p.uid);
      return { status: 'open', unboundPlayers };
    } catch (err) {
      console.error('Check game error:', err);
      return { status: 'error', msg: err.message };
    } finally {
      loading.value = false;
    }
  };

  /**
   * Join by binding to existing seat
   */
  const joinByBinding = async (id, playerId) => {
    loading.value = true;
    try {
      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', id);
        const gameDoc = await t.get(gameRef);
        const players = gameDoc.data().players;
        
        const newPlayers = players.map(p => {
          if (p.id === playerId) {
            if (p.uid) throw new Error('Seat already taken');
            return { ...p, uid: authStore.user.uid, name: authStore.displayName };
          }
          return p;
        });
        
        t.update(gameRef, { players: newPlayers });
      });
      
      await joinGameListener(id);
      return true;
    } catch (err) {
      console.error('Join by binding error:', err);
      error.value = 'Failed to join: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Join as new player
   */
  const joinAsNewPlayer = async (id, buyInAmount = DEFAULT_BUY_IN) => {
    loading.value = true;
    try {
      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', id);
        const gameDoc = await t.get(gameRef);
        const players = gameDoc.data().players;
        
        if (players.some(p => p.uid === authStore.user.uid)) {
          throw new Error('Already in game');
        }
        
        let baseName = authStore.displayName;
        let finalName = baseName;
        let counter = 2;
        const existingNames = players.map(p => p.name);
        
        while (existingNames.includes(finalName)) {
          finalName = `${baseName} (${counter})`;
          counter++;
        }
        
        const newPlayer = {
          id: Date.now().toString(),
          name: finalName,
          uid: authStore.user.uid,
          buyIn: parseInt(buyInAmount),
          stack: 0
        };
        
        t.update(gameRef, { players: arrayUnion(newPlayer) });
      });
      
      await joinGameListener(id);
      return true;
    } catch (err) {
      console.error('Join as new player error:', err);
      error.value = 'Failed to join: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Add player (host only)
   */
  const addPlayer = async (name) => {
    if (!gameId.value || !isHost.value) return false;
    
    try {
      const newPlayer = {
        id: Date.now().toString(),
        name: name || 'Player',
        uid: null,
        buyIn: DEFAULT_BUY_IN,
        stack: 0
      };
      
      await updateDoc(doc(db, 'games', gameId.value), {
        players: arrayUnion(newPlayer)
      });
      
      return true;
    } catch (err) {
      console.error('Add player error:', err);
      error.value = 'Failed to add player: ' + err.message;
      return false;
    }
  };

  /**
   * Update player
   */
  const updatePlayer = async (player) => {
    if (!gameId.value) return false;
    
    try {
      const updatedPlayers = game.value.players.map(p => 
        p.id === player.id ? player : p
      );
      
      await updateDoc(doc(db, 'games', gameId.value), {
        players: updatedPlayers
      });
      
      return true;
    } catch (err) {
      console.error('Update player error:', err);
      error.value = 'Failed to update player: ' + err.message;
      return false;
    }
  };

  /**
   * Remove player
   */
  const removePlayer = async (player) => {
    if (!gameId.value) return false;
    
    try {
      const updatedPlayers = game.value.players.filter(p => p.id !== player.id);
      
      await updateDoc(doc(db, 'games', gameId.value), {
        players: updatedPlayers
      });
      
      return true;
    } catch (err) {
      console.error('Remove player error:', err);
      error.value = 'Failed to remove player: ' + err.message;
      return false;
    }
  };

  /**
   * Bind seat to current user
   */
  const bindSeat = async (player) => {
    if (!gameId.value) return false;
    
    try {
      const updatedPlayers = game.value.players.map(p => 
        p.id === player.id ? { ...p, name: authStore.displayName, uid: authStore.user.uid } : p
      );
      
      await updateDoc(doc(db, 'games', gameId.value), {
        players: updatedPlayers
      });
      
      return true;
    } catch (err) {
      console.error('Bind seat error:', err);
      error.value = 'Failed to bind seat: ' + err.message;
      return false;
    }
  };

  /**
   * Settle game
   */
  const settleGame = async (exchangeRate = 10) => {
    if (!gameId.value) return false;
    
    loading.value = true;
    try {
      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', gameId.value);
        const gameDoc = await t.get(gameRef);
        
        if (!gameDoc.exists()) throw new Error('Game not found');
        
        const gameData = gameDoc.data();
        const players = gameData.players;
        
        // Save to each player's history
        for (const p of players) {
          if (p.uid) {
            const userRef = doc(db, 'users', p.uid);
            const userDoc = await t.get(userRef);
            
            const record = {
              date: new Date().toISOString(),
              createdAt: Date.now(),
              profit: (p.stack || 0) - p.buyIn,
              rate: exchangeRate,
              gameName: gameData.name
            };
            
            if (userDoc.exists()) {
              t.update(userRef, { history: arrayUnion(record) });
            } else {
              t.set(userRef, { history: [record], createdAt: Date.now() });
            }
          }
        }
        
        // Mark game as completed
        t.update(gameRef, { status: GAME_STATUS.COMPLETED });
      });
      
      // Clean up
      game.value = null;
      gameId.value = null;
      localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
      
      // Reload user history
      await userStore.loadUserData();
      
      return true;
    } catch (err) {
      console.error('Settle game error:', err);
      error.value = 'Failed to settle game: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Close/delete game
   */
  const closeGame = async () => {
    if (!gameId.value) return false;
    
    loading.value = true;
    try {
      await deleteDoc(doc(db, 'games', gameId.value));
      
      game.value = null;
      gameId.value = null;
      localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
      
      return true;
    } catch (err) {
      console.error('Close game error:', err);
      error.value = 'Failed to close game: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Load my rooms (active rooms created or joined by user)
   * Note: For better performance with many active games, consider:
   * - Using a compound query with an array-contains filter
   * - Maintaining a user-room relationship collection
   * - Adding pagination for large datasets
   */
  const loadMyRooms = async () => {
    if (!authStore.user) return;
    
    loading.value = true;
    try {
      const gamesRef = collection(db, 'games');
      const q = query(gamesRef, where('status', '==', GAME_STATUS.ACTIVE));
      const snapshot = await getDocs(q);
      
      const rooms = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const isHost = data.hostUid === authStore.user.uid;
        const isPlayer = data.players?.some(p => p.uid === authStore.user.uid);
        
        if (isHost || isPlayer) {
          rooms.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      // Sort by creation time, newest first
      myRooms.value = rooms.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      console.error('Load my rooms error:', err);
      error.value = 'Failed to load rooms: ' + err.message;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Cleanup (unsubscribe from listeners)
   */
  const cleanup = () => {
    if (unsubscribeGame) {
      unsubscribeGame();
      unsubscribeGame = null;
    }
  };

  return {
    game,
    gameId,
    myRooms,
    loading,
    error,
    isInGame,
    isHost,
    myPlayer,
    totalPot,
    totalStack,
    gap,
    createGame,
    joinGameListener,
    checkGameStatus,
    joinByBinding,
    joinAsNewPlayer,
    addPlayer,
    updatePlayer,
    removePlayer,
    bindSeat,
    settleGame,
    closeGame,
    loadMyRooms,
    cleanup
  };
});
