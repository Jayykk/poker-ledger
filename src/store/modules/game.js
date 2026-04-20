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
import { GAME_STATUS, GAME_TYPE, DEFAULT_BUY_IN, STORAGE_KEYS } from '../../utils/constants.js';

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
   * @param {string} name - Game name
   * @param {number} buyInAmount - Buy-in amount
   * @param {string} type - Game type ('live' or 'online')
   * @param {object} options - Additional options for online games (blinds, maxPlayers, etc.)
   */
  const createGame = async (name, buyInAmount = DEFAULT_BUY_IN, type = GAME_TYPE.LIVE, options = {}) => {
    if (!authStore.user) return null;
    
    loading.value = true;
    error.value = '';
    
    try {
      const hostName = authStore.displayName;
      const gameData = {
        name: name || 'Poker Game',
        roomCode: Math.floor(100000 + Math.random() * 900000).toString(), // 6-digit code
        hostUid: authStore.user.uid,
        hostName,
        type, // Add game type
        status: type === GAME_TYPE.ONLINE ? GAME_STATUS.WAITING : GAME_STATUS.ACTIVE,
        createdAt: Date.now(),
        baseBuyIn: parseInt(buyInAmount),
        players: [{
          id: Date.now().toString(),
          name: hostName,
          uid: authStore.user.uid,
          buyIn: parseInt(buyInAmount),
          stack: 0
        }]
      };

      // Add online-specific fields
      if (type === GAME_TYPE.ONLINE) {
        gameData.maxPlayers = options.maxPlayers || 10;
        gameData.blinds = options.blinds || { small: 1, big: 2 };
        gameData.invitedUsers = options.invitedUsers || [];
      }

      // Add tournament-specific fields
      if (type === GAME_TYPE.TOURNAMENT) {
        gameData.tournamentSessionId = options.tournamentSessionId || null;
        gameData.baseBuyIn = parseInt(buyInAmount);
      }
      
      const docRef = await addDoc(collection(db, 'games'), gameData);
      
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
      return { status: 'open', unboundPlayers, baseBuyIn: snap.data().baseBuyIn || DEFAULT_BUY_IN };
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
  const addPlayer = async (name, buyIn) => {
    if (!gameId.value || !isHost.value) return false;
    
    try {
      const buyInAmount = buyIn || game.value?.baseBuyIn || DEFAULT_BUY_IN;
      const newPlayer = {
        id: Date.now().toString(),
        name: name || 'Player',
        uid: null,
        buyIn: buyInAmount,
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
        // Phase 1: Read all documents first
        const gameRef = doc(db, 'games', gameId.value);
        const gameDoc = await t.get(gameRef);
        
        if (!gameDoc.exists()) throw new Error('Game not found');
        
        const gameData = gameDoc.data();
        const players = gameData.players;
        
        // Read all user documents for players with uid
        const userReads = [];
        for (const p of players) {
          if (p.uid) {
            const userRef = doc(db, 'users', p.uid);
            userReads.push({
              player: p,
              userRef: userRef,
              userDoc: await t.get(userRef)
            });
          }
        }
        
        // Phase 2: Prepare all records
        const userWrites = userReads.map(({ player, userRef, userDoc }) => {
          const record = {
            date: new Date().toISOString(),
            createdAt: Date.now(),
            profit: (player.stack || 0) - player.buyIn,
            rate: exchangeRate,
            gameName: gameData.name,
            gameId: gameId.value,
            type: gameData.type || 'live', // Include game type
            // Save complete settlement data
            settlement: players.map(p => ({
              odId: p.uid || null,
              name: p.name,
              buyIn: p.buyIn,
              stack: p.stack || 0,
              profit: (p.stack || 0) - p.buyIn
            }))
          };
          return { userRef, userDoc, record };
        });
        
        // Phase 3: Execute all writes
        for (const { userRef, userDoc, record } of userWrites) {
          if (userDoc.exists()) {
            t.update(userRef, { history: arrayUnion(record) });
          } else {
            t.set(userRef, { history: [record], createdAt: Date.now() });
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
    
    // 檢查是否為房主
    if (!isHost.value) {
      error.value = 'Only the host can close the game';
      return false;
    }
    
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
   * Eliminate a player (tournament only)
   * Sets placement = current alive count (last out = highest number = worst rank)
   * If only 1 player remains after elimination, auto-crown them as champion (placement=1)
   */
  const eliminatePlayer = async (playerId) => {
    if (!gameId.value || !isHost.value) return false;

    try {
      const players = game.value.players;
      const aliveBefore = players.filter(p => !p.eliminated);
      const placement = aliveBefore.length; // e.g. 5 alive → eliminated gets 5th

      const updatedPlayers = players.map(p => {
        if (p.id === playerId) {
          return { ...p, eliminated: true, eliminatedAt: Date.now(), placement };
        }
        return p;
      });

      // If only 1 player left alive, auto-crown champion
      const aliveAfter = updatedPlayers.filter(p => !p.eliminated);
      if (aliveAfter.length === 1) {
        const champIdx = updatedPlayers.findIndex(p => p.id === aliveAfter[0].id);
        updatedPlayers[champIdx] = { ...updatedPlayers[champIdx], placement: 1 };
      }

      await updateDoc(doc(db, 'games', gameId.value), { players: updatedPlayers });
      return true;
    } catch (err) {
      console.error('Eliminate player error:', err);
      error.value = 'Failed to eliminate player: ' + err.message;
      return false;
    }
  };

  /**
   * Re-entry a previously eliminated player (tournament only)
   * Resets elimination state, adds another baseBuyIn to their total buyIn.
   * Also updates the tournament session counters so the clock stays in sync.
   */
  const reentryPlayer = async (playerId) => {
    if (!gameId.value || !isHost.value) return false;

    try {
      // Validate re-entry level limit and per-player count from tournament session
      const sessionId = game.value.tournamentSessionId;
      if (sessionId) {
        const sessionRef = doc(db, 'tournamentSessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const sessionData = sessionSnap.data();
          const cfg = sessionData.config || {};
          const st = sessionData.state || {};

          // Check per-player re-entry count limit
          const maxReentries = cfg.maxReentries ?? 0;
          if (maxReentries > 0) {
            const player = game.value.players.find(p => p.id === playerId);
            const baseBuyIn = game.value.baseBuyIn || DEFAULT_BUY_IN;
            const reentryCount = Math.max(0, Math.round((player?.buyIn || 0) / baseBuyIn) - 1);
            if (reentryCount >= maxReentries) {
              error.value = 'Player has reached the maximum re-entry limit';
              return false;
            }
          }

          // Check level limit
          const reentryUntilLevel = cfg.reentryUntilLevel || 0;
          if (reentryUntilLevel > 0) {
            const levels = cfg.levels || [];
            const idx = st.currentLevelIndex ?? 0;
            let effectiveLevel = 0;
            for (let i = idx; i >= 0; i--) {
              if (!levels[i]?.isBreak) {
                effectiveLevel = levels[i]?.level ?? 0;
                break;
              }
            }
            if (effectiveLevel >= reentryUntilLevel) {
              error.value = 'Re-entry is no longer allowed at this level';
              return false;
            }
          }
        }
      }

      const baseBuyIn = game.value.baseBuyIn || DEFAULT_BUY_IN;
      const updatedPlayers = game.value.players.map(p => {
        if (p.id === playerId) {
          return {
            ...p,
            eliminated: false,
            eliminatedAt: null,
            placement: null,
            buyIn: (p.buyIn || 0) + baseBuyIn,
          };
        }
        return p;
      });

      await updateDoc(doc(db, 'games', gameId.value), { players: updatedPlayers });

      // Sync tournament session counters (playersRemaining, reentries, playersRegistered)
      if (sessionId) {
        const sessionRef = doc(db, 'tournamentSessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const st = sessionSnap.data().state || {};
          await updateDoc(sessionRef, {
            'state.playersRemaining': (st.playersRemaining || 0) + 1,
            'state.reentries': (st.reentries || 0) + 1,
            'state.playersRegistered': (st.playersRegistered || 0) + 1,
          });
        }
      }

      return true;
    } catch (err) {
      console.error('Reentry player error:', err);
      error.value = 'Failed to re-entry player: ' + err.message;
      return false;
    }
  };

  /**
   * Settle a tournament game.
   * Uses payoutRatios from the tournament session config to distribute the prize pool.
   * No exchange rate — buy-in is real money, profit = prize won − total buy-in paid.
   */
  const settleTournament = async (payoutRatios = []) => {
    if (!gameId.value) return false;

    loading.value = true;
    try {
      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', gameId.value);
        const gameDoc = await t.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found');

        const gameData = gameDoc.data();
        const players = gameData.players;

        // Calculate prize pool from all buy-ins
        const totalBuyIns = players.reduce((sum, p) => sum + (p.buyIn || 0), 0);

        // Build placement → prize map
        const prizeMap = {};
        for (const r of payoutRatios) {
          prizeMap[r.place] = Math.round(totalBuyIns * r.percentage / 100);
        }

        // Read all user documents
        const userReads = [];
        for (const p of players) {
          if (p.uid) {
            const userRef = doc(db, 'users', p.uid);
            userReads.push({ player: p, userRef, userDoc: await t.get(userRef) });
          }
        }

        // Prepare settlement records
        const settlement = players
          .filter(p => p.placement)
          .sort((a, b) => a.placement - b.placement)
          .map(p => ({
            odId: p.uid || null,
            name: p.name,
            placement: p.placement,
            buyIn: p.buyIn || 0,
            prize: prizeMap[p.placement] || 0,
            profit: (prizeMap[p.placement] || 0) - (p.buyIn || 0),
          }));

        // Write history for each user with uid
        for (const { player, userRef, userDoc } of userReads) {
          const prize = prizeMap[player.placement] || 0;
          const record = {
            date: new Date().toISOString(),
            createdAt: Date.now(),
            profit: prize - (player.buyIn || 0),
            rate: 1, // no exchange rate for tournaments
            gameName: gameData.name,
            gameId: gameId.value,
            type: 'tournament',
            placement: player.placement || null,
            settlement,
          };
          if (userDoc.exists()) {
            t.update(userRef, { history: arrayUnion(record) });
          } else {
            t.set(userRef, { history: [record], createdAt: Date.now() });
          }
        }

        // Mark game as completed
        t.update(gameRef, { status: GAME_STATUS.COMPLETED });
      });

      // Clean up
      game.value = null;
      gameId.value = null;
      localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
      await userStore.loadUserData();

      return true;
    } catch (err) {
      console.error('Settle tournament error:', err);
      error.value = 'Failed to settle tournament: ' + err.message;
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
    eliminatePlayer,
    reentryPlayer,
    settleTournament,
    loadMyRooms,
    cleanup
  };
});
