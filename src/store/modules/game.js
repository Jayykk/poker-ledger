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
  increment,
  runTransaction,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuthStore } from './auth.js';
import { GAME_STATUS, GAME_TYPE, DEFAULT_BUY_IN, STORAGE_KEYS } from '../../utils/constants.js';
import { createSyncRequestToken } from '../../utils/historyProjection.js';

function getEffectiveTournamentLevel(levels = [], currentLevelIndex = 0) {
  const normalizedIndex = Number.isFinite(Number(currentLevelIndex))
    ? Math.min(levels.length - 1, Math.max(0, Math.floor(Number(currentLevelIndex))))
    : 0;

  for (let index = normalizedIndex; index >= 0; index -= 1) {
    if (!levels[index]?.isBreak) {
      return levels[index]?.level ?? 0;
    }
  }

  return 0;
}

function isTournamentReentryClosed(sessionData = {}) {
  const config = sessionData.config || {};
  const state = sessionData.state || {};
  const reentryUntilLevel = config.reentryUntilLevel || 0;

  if (reentryUntilLevel <= 0) {
    return true;
  }

  const effectiveLevel = getEffectiveTournamentLevel(config.levels || [], state.currentLevelIndex ?? 0);
  return effectiveLevel >= reentryUntilLevel;
}

export const useGameStore = defineStore('game', () => {
  const authStore = useAuthStore();
  
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
    if (!gameId.value || !isHost.value) return null;
    
    try {
      const buyInAmount = buyIn ?? game.value?.baseBuyIn ?? DEFAULT_BUY_IN;
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
      
      return newPlayer;
    } catch (err) {
      console.error('Add player error:', err);
      error.value = 'Failed to add player: ' + err.message;
      return null;
    }
  };

  /**
   * Update player
   */
  const updatePlayer = async (player) => {
    if (!gameId.value) return false;
    
    try {
      const gameRef = doc(db, 'games', gameId.value);
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found');

        const players = gameSnap.data().players || [];
        let found = false;
        const updatedPlayers = players.map(p => {
          if (p.id === player.id) {
            found = true;
            const nextPlayer = { ...p };
            for (const field of ['name', 'buyIn', 'stack']) {
              if (Object.prototype.hasOwnProperty.call(player, field)) {
                nextPlayer[field] = player[field];
              }
            }
            return nextPlayer;
          }
          return p;
        });

        if (!found) throw new Error('Player not found');
        transaction.update(gameRef, { players: updatedPlayers });
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
      const gameRef = doc(db, 'games', gameId.value);
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found');

        const players = gameSnap.data().players || [];
        const updatedPlayers = players.filter(p => p.id !== player.id);
        if (updatedPlayers.length === players.length) {
          throw new Error('Player not found');
        }

        transaction.update(gameRef, { players: updatedPlayers });
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
      const gameRef = doc(db, 'games', gameId.value);
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found');

        const players = gameSnap.data().players || [];
        let found = false;
        const updatedPlayers = players.map(p => {
          if (p.id !== player.id) return p;
          found = true;
          if (p.uid && p.uid !== authStore.user.uid) {
            throw new Error('Seat already taken');
          }
          return { ...p, name: authStore.displayName, uid: authStore.user.uid };
        });

        if (!found) throw new Error('Player not found');
        transaction.update(gameRef, { players: updatedPlayers });
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
      const settledGameId = gameId.value;
      const syncToken = createSyncRequestToken('settle');
      const nowMs = Date.now();

      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', settledGameId);
        const gameDoc = await t.get(gameRef);

        if (!gameDoc.exists()) throw new Error('Game not found');

        const gameData = gameDoc.data();
        const players = gameData.players;

        const settlementSnapshot = players.map((player) => ({
          odId: player.uid || null,
          name: player.name,
          buyIn: Math.round(player.buyIn || 0),
          stack: Math.round(player.stack || 0),
          profit: Math.round((player.stack || 0) - player.buyIn),
        }));

        t.update(gameRef, {
          status: GAME_STATUS.COMPLETED,
          rate: Number(exchangeRate) || 1,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          settlementSnapshot,
          'historyProjection.requestToken': syncToken,
          'historyProjection.requestedAt': nowMs,
        });
      });

      return {
        success: true,
        gameId: settledGameId,
        syncToken,
      };
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
   * If only 1 player remains after elimination and re-entry is closed,
   * auto-crown them as champion (placement=1)
   */
  const eliminatePlayer = async (playerId) => {
    if (!gameId.value) return false;

    try {
      const gameRef = doc(db, 'games', gameId.value);
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found');

        const gameData = gameSnap.data();
        const players = gameData.players || [];
        const aliveBefore = players.filter(p => !p.eliminated);
        const target = players.find(p => p.id === playerId);
        if (!target) throw new Error('Player not found');
        if (target.eliminated) return;
        if (aliveBefore.length <= 1) throw new Error('Cannot eliminate the last remaining player');

        const placement = aliveBefore.length; // e.g. 5 alive → eliminated gets 5th
        let updatedPlayers = players.map(p => {
          if (p.id === playerId) {
            return { ...p, eliminated: true, eliminatedAt: Date.now(), placement };
          }
          return p;
        });

        const aliveAfter = updatedPlayers.filter(p => !p.eliminated).length;
        const hasSingleWinner = aliveAfter === 1;
        const sessionId = gameData.tournamentSessionId;
        let shouldEndTournament = hasSingleWinner && !sessionId;

        if (sessionId) {
          const sessionRef = doc(db, 'tournamentSessions', sessionId);
          const sessionSnap = await transaction.get(sessionRef);
          if (sessionSnap.exists()) {
            shouldEndTournament = hasSingleWinner && isTournamentReentryClosed(sessionSnap.data());

            const sessionUpdates = {
              'state.playersRemaining': aliveAfter,
              updatedAt: serverTimestamp(),
            };

            if (shouldEndTournament) {
              sessionUpdates['state.status'] = 'ended';
              sessionUpdates['state.timeLeftSeconds'] = 0;
              sessionUpdates['state.lastTickAt'] = null;
            }

            transaction.update(sessionRef, sessionUpdates);
          }
        }

        if (shouldEndTournament) {
          updatedPlayers = updatedPlayers.map(p => {
            if (p.eliminated) return p;
            return { ...p, placement: 1 };
          });
        }

        transaction.update(gameRef, { players: updatedPlayers });
      });
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
    if (!gameId.value) return false;

    try {
      // Validate re-entry level limit and per-player count from tournament session
      const sessionId = game.value.tournamentSessionId;
      let cfg = {};
      let sessionRef = null;

      if (sessionId) {
        sessionRef = doc(db, 'tournamentSessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const sessionData = sessionSnap.data();
          cfg = sessionData.config || {};
          const st = sessionData.state || {};

          // Check level limit (session state is authoritative)
          const reentryUntilLevel = cfg.reentryUntilLevel || 0;
          if (reentryUntilLevel > 0) {
            const effectiveLevel = getEffectiveTournamentLevel(cfg.levels || [], st.currentLevelIndex ?? 0);
            if (effectiveLevel >= reentryUntilLevel) {
              error.value = 'Re-entry is no longer allowed at this level';
              return false;
            }
          }
        }
      }

      const baseBuyIn = game.value.baseBuyIn || DEFAULT_BUY_IN;
      const maxReentries = cfg.maxReentries ?? 0;
      const gameRef = doc(db, 'games', gameId.value);

      // Use a Firestore transaction to atomically read the latest data,
      // validate reentry count, and update both elimination state and buyIn.
      await runTransaction(db, async (transaction) => {
        const gameSnap = await transaction.get(gameRef);
        if (!gameSnap.exists()) throw new Error('Game not found');

        const players = gameSnap.data().players || [];
        const player = players.find(p => p.id === playerId);
        if (!player) throw new Error('Player not found');

        // Validate per-player reentry count from the LATEST server data
        if (maxReentries > 0) {
          const reentryCount = Math.max(0, Math.round((player.buyIn || 0) / baseBuyIn) - 1);
          if (reentryCount + 1 >= maxReentries) {
            throw new Error('REENTRY_LIMIT');
          }
        }

        const updatedPlayers = players.map(p => {
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

        transaction.update(gameRef, { players: updatedPlayers });
      });

      // Sync tournament session counters (playersRemaining, reentries)
      // NOTE: playersRegistered is NOT incremented here because re-entry
      // revives an existing player — it does not add a new unique participant.
      if (sessionRef) {
        await updateDoc(sessionRef, {
          'state.playersRemaining': increment(1),
          'state.reentries': increment(1),
          updatedAt: serverTimestamp(),
        });
      }

      return true;
    } catch (err) {
      if (err.message === 'REENTRY_LIMIT') {
        error.value = 'Player has reached the maximum re-entry limit';
        return false;
      }
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
      const settledGameId = gameId.value;
      const syncToken = createSyncRequestToken('settle-tournament');
      const nowMs = Date.now();
      let settlementResult = [];

      await runTransaction(db, async (t) => {
        const gameRef = doc(db, 'games', settledGameId);
        const gameDoc = await t.get(gameRef);
        if (!gameDoc.exists()) throw new Error('Game not found');

        const gameData = gameDoc.data();
        const players = gameData.players;

        // Calculate prize pool from all buy-ins
        const totalBuyIns = players.reduce((sum, p) => sum + (p.buyIn || 0), 0);

        // Auto-crown last alive player as champion (placement=1) if not already set
        const alive = players.filter(p => !p.eliminated);
        if (alive.length === 1 && !alive[0].placement) {
          const champIdx = players.findIndex(p => p.id === alive[0].id);
          players[champIdx] = { ...players[champIdx], placement: 1 };
        }

        // Build placement → prize map
        const prizeMap = {};
        for (const r of payoutRatios) {
          prizeMap[r.place] = Math.round(totalBuyIns * r.percentage / 100);
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
        settlementResult = settlement;

        t.update(gameRef, {
          players,
          status: GAME_STATUS.COMPLETED,
          rate: 1,
          payoutRatios,
          settlementSnapshot: settlement,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          'historyProjection.requestToken': syncToken,
          'historyProjection.requestedAt': nowMs,
        });
      });

      return {
        success: true,
        settlement: settlementResult,
        gameId: settledGameId,
        syncToken,
      };
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

  const clearCurrentGame = () => {
    game.value = null;
    gameId.value = null;
    localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
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
    clearCurrentGame,
    loadMyRooms,
    cleanup
  };
});
