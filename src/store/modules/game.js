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
import { functions } from '../../firebase-init.js';
import { httpsCallable } from 'firebase/functions';
import { useAuthStore } from './auth.js';
import { GAME_STATUS, GAME_TYPE, DEFAULT_BUY_IN, STORAGE_KEYS } from '../../utils/constants.js';
import { timestampToMillis } from '../../utils/formatters.js';
import { applyPlayerChange, isSnapshotCurrent } from '../../utils/ledgerOps.js';
import { normalizeCashDecimals } from '../../utils/cashRounding.js';
import { BUY_IN_CLOSED, isTimedClock, isTimedBuyInClosed } from '../../utils/timedStructure.js';
import { tournamentSettlementErrorKey } from '../../utils/tournamentSettlementErrors.js';
import { cashSettlementErrorKey } from '../../utils/cashSettlementErrors.js';
import {
  gameBountyPerEntry, planKnockout, applyKnockout, resetHeadForReentry, restoreHeadAfterReentryUndo,
  isKnockoutBounty, isMysteryBounty, mysteryPhaseActive, freeSlotCount, addTicket, removeTicket,
  setTicketEnvelope, remainingSlots, allTickets,
} from '../../utils/bounty.js';
import {
  TX_TYPE_ELIMINATE,
  TX_TYPE_REENTRY,
  applyElimination,
  applyReentry,
  crownSurvivors,
  snapshotSessionClock,
  buildEliminationRestore,
  buildReopenedSessionUpdates,
  revertElimination,
  revertReentry,
  findTxTarget,
} from '../../utils/tournamentElimination.js';

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
  // Game the listener follows, and the highest roster rev already on screen
  // for it (see isSnapshotCurrent / commitRoster).
  let listenedGameId = null;
  let localRev = 0;
  let resubscribeTimer = null;

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
        // Server clock — client clocks skew across devices and this field
        // orders the room list. Readers normalize via timestampToMillis().
        createdAt: serverTimestamp(),
        baseBuyIn: parseInt(buyInAmount),
        players: [{
          id: Date.now().toString(),
          name: hostName,
          uid: authStore.user.uid,
          ...(authStore.isGuest ? { isGuest: true } : {}),
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
        // Bounty format (KO) from the template — see utils/bounty.js
        if (options.bounty && options.bounty.type && options.bounty.type !== 'none') {
          gameData.bounty = options.bounty;
        }
      }

      // Optional cash settlement rate set at creation time (from cash preset).
      // Skipped for online (already hardcoded to 1 elsewhere) and tournament.
      if (type === GAME_TYPE.LIVE) {
        const rateNum = Number(options.rate);
        if (Number.isFinite(rateNum) && rateNum > 0) {
          gameData.rate = rateNum;
        }
        // What one buy-in costs (the rate was derived from it) — for display.
        const buyInAmountNum = Number(options.buyInAmount);
        if (Number.isFinite(buyInAmountNum) && buyInAmountNum > 0) {
          gameData.buyInAmount = buyInAmountNum;
        }
        // Settlement rounding (0 / 1 / 2 decimals) from the cash preset.
        const cashDecimals = normalizeCashDecimals(options.cashDecimals);
        if (cashDecimals !== null) gameData.cashDecimals = cashDecimals;
        // Timed game (限時賽 with a blind structure): linked clock session.
        if (options.tournamentSessionId) {
          gameData.tournamentSessionId = options.tournamentSessionId;
        }
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
      unsubscribeGame = null;
    }
    if (id !== listenedGameId) localRev = 0;
    listenedGameId = id;

    unsubscribeGame = onSnapshot(doc(db, 'games', id), (snap) => {
      if (snap.exists() && snap.data().status === GAME_STATUS.ACTIVE) {
        const data = snap.data();
        // Our own commit is already on screen — don't let a snapshot that
        // predates it roll the roster back.
        if (gameId.value === snap.id && !isSnapshotCurrent(data.rev, localRev)) return;
        localRev = Number(data.rev) || 0;
        game.value = { id: snap.id, ...data };
        gameId.value = snap.id;
        localStorage.setItem(STORAGE_KEYS.LAST_GAME_ID, id);
      } else {
        game.value = null;
        gameId.value = null;
        listenedGameId = null;
        localStorage.removeItem(STORAGE_KEYS.LAST_GAME_ID);
      }
    }, (err) => {
      // A dead listener leaves the screen frozen on stale data — retry.
      console.error('[game] snapshot error:', err);
      unsubscribeGame = null;
      if (err?.code !== 'permission-denied') scheduleResubscribe();
    });
  };

  const resubscribe = () => {
    if (resubscribeTimer) {
      clearTimeout(resubscribeTimer);
      resubscribeTimer = null;
    }
    if (listenedGameId) joinGameListener(listenedGameId);
  };

  const scheduleResubscribe = (delayMs = 3000) => {
    if (resubscribeTimer) return;
    resubscribeTimer = setTimeout(() => {
      resubscribeTimer = null;
      if (listenedGameId && !unsubscribeGame) joinGameListener(listenedGameId);
    }, delayMs);
  };

  // Mobile browsers and LINE's webview can stall the realtime stream while
  // backgrounded; a fresh subscription pulls the latest doc on return.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resubscribe();
    });
    window.addEventListener('online', resubscribe);
  }

  /**
   * Read-modify-write the roster in a client transaction, then put the
   * committed roster on screen right away. Transactions get no latency
   * compensation, so without the local apply this device would wait for the
   * realtime listener to echo its own write back.
   *
   * Every write bumps `rev` so older in-flight snapshots can be ignored.
   *
   * @param {string} targetGameId
   * @param {(players: Array, data: object, t: object) => ({players: Array}|Promise<{players: Array}>)} mutate
   *   Must be retry-safe (Firestore may re-run it); may read other docs
   *   through t before any write, and write them.
   * @returns {Promise<object>} mutate's result plus the committed rev
   */
  const commitRoster = async (targetGameId, mutate) => {
    const gameRef = doc(db, 'games', targetGameId);
    const result = await runTransaction(db, async (t) => {
      const snap = await t.get(gameRef);
      if (!snap.exists()) throw new Error('Game not found');
      const data = snap.data();
      const out = await mutate(data.players || [], data, t);
      const rev = (Number(data.rev) || 0) + 1;
      t.update(gameRef, { players: out.players, rev });
      return { ...out, rev };
    });

    if (gameId.value === targetGameId && game.value && result.rev > localRev) {
      localRev = result.rev;
      game.value = { ...game.value, players: result.players, rev: result.rev };
    }
    return result;
  };

  /**
   * Timed games (限時賽 on a blind structure): refuse new money once the
   * structure's cutoff level is reached or time is up. Reads the linked clock
   * inside the caller's transaction so a stale screen can't slip one through.
   * @throws {Error} BUY_IN_CLOSED
   */
  const assertTimedBuyInOpen = async (gameData, t) => {
    if (gameData.type !== GAME_TYPE.LIVE || !gameData.tournamentSessionId) return;
    const snap = await t.get(doc(db, 'tournamentSessions', gameData.tournamentSessionId));
    if (!snap.exists()) return;
    const sessionData = snap.data();
    if (isTimedClock(sessionData.config) && isTimedBuyInClosed(sessionData, Date.now())) {
      throw new Error(BUY_IN_CLOSED);
    }
  };

  /**
   * Record a buy-in / add-on / buy-in correction (type 'modify'): the seat's
   * buyIn moves by `amount` and the audit record is written in the same
   * transaction, so the log and the roster can't disagree. Optional `fields`
   * (stack / name) ride along in the same write. Replaces the recordBuyInTx
   * Cloud Function (no cold start, and this device updates on commit).
   *
   * @returns {Promise<{success: true, txId: string, totalBuyIn: number}>}
   */
  const recordLedgerTx = async ({
    gameId: targetGameId = gameId.value,
    targetId, targetUid, targetName, amount, type = 'buy_in', fields = {},
  } = {}) => {
    const actionUid = authStore.user?.uid;
    if (!targetGameId || !actionUid) throw new Error('Not in a game');
    const safeAmount = Number(amount) || 0;
    const txRef = doc(collection(db, 'transactions'));

    const result = await commitRoster(targetGameId, async (players, data, t) => {
      // A host 'modify' correction stays allowed after the cutoff.
      if (type === 'buy_in' || type === 'add_on') await assertTimedBuyInOpen(data, t);
      const change = applyPlayerChange(
        players,
        { targetId, targetUid, targetName },
        { buyInDelta: safeAmount, fields },
      );
      t.set(txRef, {
        gameId: targetGameId,
        targetId: targetId || null,
        targetUid: targetUid || null,
        targetName,
        actionUid,
        actionName: authStore.displayName || 'Player',
        amount: safeAmount,
        type,
        status: 'active',
        undoneBy: null,
        undoOf: null,
        timestamp: serverTimestamp(),
      });
      return change;
    });

    return { success: true, txId: txRef.id, totalBuyIn: result.player.buyIn || 0 };
  };

  /**
   * Undo a ledger transaction: flip it to 'undone', write the compensating
   * record, and move the seat's buyIn back — all in one transaction.
   * Replaces the undoBuyInTx Cloud Function. Rules limit the flip to the
   * original actor, the host, or an admin.
   *
   * @returns {Promise<{success: true, undoTxId: string, totalBuyIn: number}>}
   */
  const undoLedgerTx = async (txId, targetGameId = gameId.value) => {
    const actionUid = authStore.user?.uid;
    if (!targetGameId || !actionUid) throw new Error('Not in a game');
    const txRef = doc(db, 'transactions', txId);
    const undoRef = doc(collection(db, 'transactions'));

    const result = await commitRoster(targetGameId, async (players, _data, t) => {
      const txSnap = await t.get(txRef);
      if (!txSnap.exists()) throw new Error('Transaction not found');
      const tx = txSnap.data();
      if (tx.gameId !== targetGameId) throw new Error('Transaction belongs to another game');
      if (tx.status !== 'active') throw new Error('Transaction already undone');
      // Elimination / re-entry records also change alive status — they go
      // through undoEliminationTx / undoReentryTx. This path only moves money.
      if (tx.type === TX_TYPE_ELIMINATE || tx.type === TX_TYPE_REENTRY) {
        throw new Error('Elimination and re-entry records must be undone from the tournament view');
      }
      const amount = Number(tx.amount) || 0;

      t.update(txRef, { status: 'undone' });
      t.set(undoRef, {
        gameId: tx.gameId,
        targetId: tx.targetId || null,
        targetUid: tx.targetUid || null,
        targetName: tx.targetName,
        actionUid,
        actionName: authStore.displayName || 'Player',
        amount: -amount || 0,
        type: 'undo',
        status: 'active',
        undoneBy: null,
        undoOf: txId,
        timestamp: serverTimestamp(),
      });

      try {
        return applyPlayerChange(players, tx, { buyInDelta: -amount });
      } catch (_) {
        // Seat was removed since — still void the record, roster unchanged.
        return { players, player: null };
      }
    });

    return { success: true, undoTxId: undoRef.id, totalBuyIn: result.player?.buyIn || 0 };
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
      await commitRoster(id, (players) => {
        const newPlayers = players.map(p => {
          if (p.id === playerId) {
            if (p.uid) throw new Error('Seat already taken');
            return {
              ...p,
              uid: authStore.user.uid,
              name: authStore.displayName,
              ...(authStore.isGuest ? { isGuest: true } : {}),
            };
          }
          return p;
        });
        return { players: newPlayers };
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
      await commitRoster(id, async (players, data, t) => {
        if (players.some(p => p.uid === authStore.user.uid)) {
          throw new Error('Already in game');
        }
        // Joining brings a buy-in with it — closed after a timed game's cutoff.
        await assertTimedBuyInOpen(data, t);
        
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
          ...(authStore.isGuest ? { isGuest: true } : {}),
          buyIn: parseInt(buyInAmount),
          stack: 0
        };
        
        return { players: [...players, newPlayer] };
      });
      
      await joinGameListener(id);
      return true;
    } catch (err) {
      console.error('Join as new player error:', err);
      // Keep the bare code so views can show the "buy-ins closed" message.
      error.value = err.message === BUY_IN_CLOSED ? BUY_IN_CLOSED : 'Failed to join: ' + err.message;
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
      
      if (game.value?.type === GAME_TYPE.LIVE && game.value?.tournamentSessionId) {
        // Timed game: a new seat brings a buy-in, so it has to pass the
        // cutoff check in the same transaction as the write — a UI check
        // made just before the level turns over isn't enough.
        await commitRoster(gameId.value, async (players, data, t) => {
          await assertTimedBuyInOpen(data, t);
          return { players: [...players, newPlayer] };
        });
      } else {
        // Plain update (not a transaction) so the SDK shows it immediately;
        // rev still moves so the snapshot guard stays monotonic.
        await updateDoc(doc(db, 'games', gameId.value), {
          players: arrayUnion(newPlayer),
          rev: increment(1),
        });
      }

      return newPlayer;
    } catch (err) {
      console.error('Add player error:', err);
      // Keep the bare code so views can show the "buy-ins closed" message.
      error.value = err.message === BUY_IN_CLOSED ? BUY_IN_CLOSED : 'Failed to add player: ' + err.message;
      return null;
    }
  };

  /**
   * Update a player's name and/or stack. buyIn is deliberately not writable
   * here — it only moves through recordLedgerTx / undoLedgerTx (by delta, with
   * an audit record), so a stale edit form can't overwrite a concurrent buy-in.
   */
  const updatePlayer = async (player) => {
    if (!gameId.value) return false;

    try {
      const fields = {};
      for (const field of ['name', 'stack']) {
        if (Object.prototype.hasOwnProperty.call(player, field)) {
          fields[field] = player[field];
        }
      }
      await commitRoster(gameId.value, (players) =>
        applyPlayerChange(players, { targetId: player.id }, { fields }));

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
      await commitRoster(gameId.value, (players) => {
        const updatedPlayers = players.filter(p => p.id !== player.id);
        if (updatedPlayers.length === players.length) {
          throw new Error('Player not found');
        }
        return { players: updatedPlayers };
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
      await commitRoster(gameId.value, (players) => {
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
        return { players: updatedPlayers };
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
  /**
   * @param {number} exchangeRate
   * @param {?number} [cashDecimals] - rounding places chosen in the dialog
   *   (null = none); omitted → the game's own setting
   */
  const settleGame = async (exchangeRate = 10, cashDecimals) => {
    if (!gameId.value) return false;
    
    loading.value = true;
    try {
      const callable = httpsCallable(functions, 'settleCashGame');
      const response = await callable({
        gameId: gameId.value,
        exchangeRate: Number(exchangeRate),
        ...(cashDecimals !== undefined ? { cashDecimals: normalizeCashDecimals(cashDecimals) } : {}),
      });
      return response.data;
    } catch (err) {
      console.error('Settle game error:', err);
      error.value = cashSettlementErrorKey(err);
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
  /**
   * Build a transaction-log record signed by the current user.
   * Shape mirrors useTransactions.js so TransactionLog.vue renders it as-is.
   */
  const buildTxRecord = ({ target, type, amount = 0, restore = null, undoOf = null, undoOfType = null }) => ({
    gameId: gameId.value,
    targetId: target.id || null,
    targetUid: target.uid || null,
    targetName: target.name,
    actionUid: authStore.user?.uid || null,
    actionName: authStore.displayName || 'Player',
    amount: Number(amount) || 0,
    type,
    status: 'active',
    undoneBy: null,
    undoOf,
    ...(undoOfType ? { undoOfType } : {}),
    ...(restore ? { restore } : {}),
    timestamp: serverTimestamp(),
  });

  /**
   * Eliminate a player. KO games: `eliminatorIds` (players still in) collect
   * the head, split equally; none → the head goes to the prize pool. The
   * bounty changes are logged on the record so undo reverses them exactly.
   */
  const eliminatePlayer = async (playerId, { eliminatorIds = [] } = {}) => {
    if (!gameId.value) return false;

    try {
      const txRef = doc(collection(db, 'transactions'));
      await commitRoster(gameId.value, async (players, gameData, transaction) => {
        const target = players.find(p => p.id === playerId);
        if (!target) throw new Error('Player not found');
        if (target.eliminated) return { players };

        const eliminatedAt = Date.now();
        const {
          players: eliminatedPlayers, placement, aliveAfter, seq, prevSeq,
        } = applyElimination(players, playerId, eliminatedAt);
        let updatedPlayers = eliminatedPlayers;

        // KO: pay the head to the eliminator(s) (or the pool)
        const perEntry = gameBountyPerEntry(gameData);
        const planned = perEntry > 0 && isKnockoutBounty(gameData.bounty)
          ? planKnockout(players, playerId, eliminatorIds, perEntry, gameData.bounty)
          : null;
        // Names go on the log record so it reads without the roster
        const knockout = planned && {
          ...planned,
          awards: planned.awards.map((a) => ({ ...a, name: players.find((p) => p.id === a.playerId)?.name || '' })),
        };
        if (knockout) updatedPlayers = applyKnockout(updatedPlayers, playerId, knockout, 1);

        const hasSingleWinner = aliveAfter === 1;
        const sessionId = gameData.tournamentSessionId;
        let shouldEndTournament = hasSingleWinner && !sessionId;
        let clockBeforeEnd = null;
        let sessionData = null;

        if (sessionId) {
          const sessionRef = doc(db, 'tournamentSessions', sessionId);
          const sessionSnap = await transaction.get(sessionRef);
          if (sessionSnap.exists()) {
            sessionData = sessionSnap.data();
            shouldEndTournament = hasSingleWinner && isTournamentReentryClosed(sessionData);

            const sessionUpdates = {
              'state.playersRemaining': aliveAfter,
              updatedAt: serverTimestamp(),
            };

            if (shouldEndTournament) {
              // Remember the clock so undoing this elimination can reopen it.
              clockBeforeEnd = snapshotSessionClock(sessionData.state || {});
              sessionUpdates['state.status'] = 'ended';
              sessionUpdates['state.timeLeftSeconds'] = 0;
              sessionUpdates['state.lastTickAt'] = null;
            }

            transaction.update(sessionRef, sessionUpdates);
          }
        }

        if (shouldEndTournament) {
          updatedPlayers = crownSurvivors(updatedPlayers);
        }

        // Mystery: once the draw phase has started, a knockout with an
        // eliminator earns one draw (a ticket on the knocked-out player).
        let mysteryTicket = null;
        const bounty = gameData.bounty;
        if (isMysteryBounty(bounty) && eliminatorIds.length) {
          const aliveIds = new Set(players.filter((p) => !p.eliminated && p.id !== playerId).map((p) => p.id));
          if (eliminatorIds.some((id) => !aliveIds.has(id))) {
            throw new Error('Eliminator must be another player still in the tournament');
          }
          const cfg = sessionData?.config || {};
          const active = mysteryPhaseActive(bounty, {
            aliveBefore: players.filter((p) => !p.eliminated).length,
            reentryClosed: sessionData ? isTournamentReentryClosed(sessionData) : true,
            level: getEffectiveTournamentLevel(cfg.levels || [], sessionData?.state?.currentLevelIndex ?? 0),
          });
          if (active && freeSlotCount(bounty, players) > 0) {
            const added = addTicket(updatedPlayers, playerId, eliminatorIds);
            updatedPlayers = added.players;
            mysteryTicket = added.ticket.id;
          }
        }

        // Log the elimination (amount 0) with everything needed to revert it.
        transaction.set(txRef, buildTxRecord({
          target,
          type: TX_TYPE_ELIMINATE,
          restore: {
            ...buildEliminationRestore({
              placement,
              eliminatedAt,
              endedTournament: shouldEndTournament,
              sessionState: clockBeforeEnd,
              seq,
              prevSeq,
            }),
            ...(knockout ? { bounty: knockout } : {}),
            ...(mysteryTicket ? { mysteryTicket } : {}),
          },
        }));

        return { players: updatedPlayers };
      });
      return true;
    } catch (err) {
      console.error('Eliminate player error:', err);
      error.value = 'Failed to eliminate player: ' + err.message;
      return false;
    }
  };

  /**
   * Undo an elimination recorded in the transaction log (tournament only).
   * The player returns to play with no placement; if that elimination had
   * ended the tournament, the provisional champion is un-crowned and the clock
   * is reopened (paused). Undo order is enforced by the UI (latest first).
   */
  const undoEliminationTx = async (txId) => {
    if (!gameId.value) return false;

    try {
      const txRef = doc(db, 'transactions', txId);
      const undoRef = doc(collection(db, 'transactions'));

      await commitRoster(gameId.value, async (players, gameData, transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Transaction not found');
        const tx = txSnap.data();
        if (tx.type !== TX_TYPE_ELIMINATE) throw new Error('Not an elimination record');
        if (tx.status !== 'active') throw new Error('Transaction already undone');
        if (tx.gameId !== gameId.value) throw new Error('Transaction belongs to another game');

        const target = findTxTarget(players, tx);
        if (!target) throw new Error('Player not found');

        const reverted = revertElimination(players, tx);
        const { aliveAfter, reopensTournament } = reverted;
        // KO: take the head back from whoever collected it
        let updatedPlayers = tx.restore?.bounty
          ? applyKnockout(reverted.players, target.id, tx.restore.bounty, -1)
          : reverted.players;
        // Mystery: the draw this knockout earned goes too (its envelope returns)
        if (tx.restore?.mysteryTicket) updatedPlayers = removeTicket(updatedPlayers, tx.restore.mysteryTicket);

        const sessionId = gameData.tournamentSessionId;
        if (sessionId) {
          const sessionRef = doc(db, 'tournamentSessions', sessionId);
          const sessionSnap = await transaction.get(sessionRef);
          if (sessionSnap.exists()) {
            transaction.update(sessionRef, {
              'state.playersRemaining': aliveAfter,
              ...(reopensTournament ? buildReopenedSessionUpdates(tx.restore?.sessionState) : {}),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(txRef, { status: 'undone' });
        transaction.set(undoRef, buildTxRecord({
          target,
          type: 'undo',
          amount: 0,
          undoOf: txId,
          undoOfType: TX_TYPE_ELIMINATE,
        }));
        return { players: updatedPlayers };
      });
      return true;
    } catch (err) {
      console.error('Undo elimination error:', err);
      error.value = 'Failed to restore player: ' + err.message;
      return false;
    }
  };

  /**
   * Undo a re-entry recorded in the transaction log (tournament only).
   * Refunds the re-entry buy-in AND puts the player back into the eliminated
   * state they had before re-entering (placement / eliminatedAt from the
   * record's snapshot), keeping session counters in sync.
   */
  const undoReentryTx = async (txId) => {
    if (!gameId.value) return false;

    try {
      const txRef = doc(db, 'transactions', txId);
      const undoRef = doc(collection(db, 'transactions'));
      let refundedAmount = 0;

      await commitRoster(gameId.value, async (players, gameData, transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Transaction not found');
        const tx = txSnap.data();
        if (tx.type !== TX_TYPE_REENTRY) throw new Error('Not a re-entry record');
        if (tx.status !== 'active') throw new Error('Transaction already undone');
        if (tx.gameId !== gameId.value) throw new Error('Transaction belongs to another game');

        const target = findTxTarget(players, tx);
        if (!target) throw new Error('Player not found');

        const reverted = revertReentry(players, tx, Date.now());
        const { aliveAfter, refunded } = reverted;
        // PKO: back to the head the player had before re-entering
        const updatedPlayers = restoreHeadAfterReentryUndo(reverted.players, target.id, tx.restore?.bountyHead);
        refundedAmount = refunded;

        const sessionId = gameData.tournamentSessionId;
        if (sessionId) {
          const sessionRef = doc(db, 'tournamentSessions', sessionId);
          const sessionSnap = await transaction.get(sessionRef);
          if (sessionSnap.exists()) {
            const st = sessionSnap.data().state || {};
            transaction.update(sessionRef, {
              'state.playersRemaining': aliveAfter,
              // playersRegistered is untouched: re-entry never added a unique player.
              'state.reentries': Math.max(0, (st.reentries || 0) - 1),
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(txRef, { status: 'undone' });
        transaction.set(undoRef, buildTxRecord({
          target,
          type: 'undo',
          amount: -refunded,
          undoOf: txId,
          undoOfType: TX_TYPE_REENTRY,
        }));
        return { players: updatedPlayers };
      });
      return { refunded: refundedAmount };
    } catch (err) {
      console.error('Undo re-entry error:', err);
      error.value = 'Failed to undo re-entry: ' + err.message;
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
      const txRef = doc(collection(db, 'transactions'));

      // Track the exact alive count from inside the transaction so we can write
      // an absolute value to the session (avoids increment() race vs startGameSync).
      let aliveAfterReentry = 0;

      // Use a Firestore transaction to atomically read the latest data,
      // validate reentry count, update elimination state + buyIn, and log the
      // re-entry (with a snapshot of the eliminated state it replaces so the
      // log's undo can put the player back exactly where they were).
      await commitRoster(gameId.value, (players, gameData, transaction) => {
        const player = players.find(p => p.id === playerId);
        if (!player) throw new Error('Player not found');
        if (!player.eliminated) throw new Error('Player is not eliminated');

        // Validate per-player reentry count from the LATEST server data
        if (maxReentries > 0) {
          const reentryCount = Math.max(0, Math.round((player.buyIn || 0) / baseBuyIn) - 1);
          if (reentryCount + 1 >= maxReentries) {
            throw new Error('REENTRY_LIMIT');
          }
        }

        // applyReentry stamps the next global statusSeq on the player and
        // snapshots the eliminated state (placement / eliminatedAt / seq) so the
        // log's undo can put them back exactly where they were.
        const reentered = applyReentry(players, playerId, baseBuyIn);
        const { aliveAfter, restore } = reentered;
        // PKO: the re-entry buys a fresh head (remember the old one for undo)
        const head = resetHeadForReentry(reentered.players, playerId, gameBountyPerEntry(gameData), gameData.bounty);
        const updatedPlayers = head.players;
        if (head.previousHead !== null) restore.bountyHead = head.previousHead;

        aliveAfterReentry = aliveAfter;
        transaction.set(txRef, buildTxRecord({
          target: player,
          type: TX_TYPE_REENTRY,
          amount: baseBuyIn,
          restore,
        }));
        return { players: updatedPlayers };
      });

      // Sync tournament session counters.
      // Use an absolute value for playersRemaining (not increment) to avoid a race
      // condition where startGameSync fires between the game transaction and this write
      // and sets playersRemaining to the new count, then increment(1) overshoots by 1.
      // NOTE: playersRegistered is NOT incremented — re-entry revives an existing player,
      // it does not add a new unique participant.
      if (sessionRef) {
        await updateDoc(sessionRef, {
          'state.playersRemaining': aliveAfterReentry,
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

  // ── Mystery bounty draws ──────────────────────────────────────────

  /**
   * Draw an envelope for a waiting ticket. `slot` comes from the draw screen
   * (random pick, or the tier the host chose for a physical envelope); the
   * transaction re-checks that it's still free.
   */
  // targetGameId: draw screens outside the room (the TV stage on the clock)
  const mysteryDraw = async (ticketId, slot, targetGameId = gameId.value) => {
    if (!targetGameId) return false;
    try {
      await commitRoster(targetGameId, (players, gameData) => {
        const ticket = allTickets(players).find((t) => t.id === ticketId);
        if (!ticket) throw new Error('Draw not found');
        if (ticket.envelope !== null && ticket.envelope !== undefined) throw new Error('Already drawn');
        if (!remainingSlots(gameData.bounty, players).some((r) => r.slot === slot)) {
          throw new Error('That envelope is already taken');
        }
        return { players: setTicketEnvelope(players, ticketId, slot) };
      });
      return true;
    } catch (err) {
      console.error('Mystery draw error:', err);
      error.value = err.message;
      return false;
    }
  };

  /** Put a drawn envelope back (the ticket waits again). */
  const mysteryUndoDraw = async (ticketId) => {
    if (!gameId.value) return false;
    try {
      await commitRoster(gameId.value, (players) => ({ players: setTicketEnvelope(players, ticketId, null) }));
      return true;
    } catch (err) {
      console.error('Mystery undo draw error:', err);
      error.value = err.message;
      return false;
    }
  };

  /**
   * End of the tournament: the champion (or, before a deal, everyone still in)
   * draws one envelope each, while envelopes last.
   */
  const mysteryFinalDraws = async () => {
    if (!gameId.value) return false;
    try {
      await commitRoster(gameId.value, (players, gameData) => {
        let next = players;
        let free = freeSlotCount(gameData.bounty, players);
        for (const p of players.filter((x) => !x.eliminated)) {
          if (free <= 0) break;
          if ((p.mysteryTickets || []).some((t) => t.final)) continue;
          next = addTicket(next, p.id, [p.id], { final: true }).players;
          free -= 1;
        }
        return { players: next };
      });
      return true;
    } catch (err) {
      console.error('Mystery final draws error:', err);
      error.value = err.message;
      return false;
    }
  };

  /** Host: change the envelopes before anything has been drawn. */
  const updateMysteryEnvelopes = async (envelopes) => {
    if (!gameId.value) return false;
    try {
      await runTransaction(db, async (transaction) => {
        const ref_ = doc(db, 'games', gameId.value);
        const snap = await transaction.get(ref_);
        if (!snap.exists()) throw new Error('Game not found');
        const data = snap.data();
        if (data.hostUid !== authStore.user?.uid) throw new Error('Only the host can change the envelopes');
        if (allTickets(data.players || []).some((t) => t.envelope !== null && t.envelope !== undefined)) {
          throw new Error('Envelopes are locked after the first draw');
        }
        transaction.update(ref_, { 'bounty.envelopes': envelopes, updatedAt: serverTimestamp() });
      });
      return true;
    } catch (err) {
      console.error('Update envelopes error:', err);
      error.value = err.message;
      return false;
    }
  };

  /**
   * Settle a tournament game.
   * Uses payoutRatios from the tournament session config to distribute the prize pool.
   * No exchange rate — buy-in is real money, profit = prize won − total buy-in paid.
   */
  const settleTournament = async () => {
    if (!gameId.value) return false;

    loading.value = true;
    try {
      const callable = httpsCallable(functions, 'settleTournamentGame');
      const response = await callable({ gameId: gameId.value });
      return response.data;
    } catch (err) {
      console.error('Settle tournament error:', err);
      error.value = tournamentSettlementErrorKey(err);
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Settle a tournament via a negotiated deal (協議結算).
   *
   * The remaining in-the-money players receive their negotiated prizes and
   * placements; already-eliminated players keep their normal placement prizes.
   * Because the game ends with 2+ players still alive, eliminatePlayer's
   * auto-end path never fires — so this also ends the linked tournament
   * session (clock) itself.
   *
   * @param {Array<{place: number, percentage: number}>} payoutRatios
   * @param {object} deal - { mode: 'icm'|'chipchop'|'custom',
   *   stacks: Object<playerId, chips>|null,
   *   allocations: Array<{playerId, prize, placement}>,
   *   approvals: Array<{playerId, name}> }
   */
  const settleTournamentWithDeal = async (deal = {}) => {
    if (!gameId.value) return false;

    loading.value = true;
    try {
      const callable = httpsCallable(functions, 'settleTournamentDeal');
      const response = await callable({ gameId: gameId.value, deal });
      return response.data;
    } catch (err) {
      console.error('Settle tournament deal error:', err);
      if (err.message?.includes('DEAL_STATE_CHANGED')) {
        error.value = 'DEAL_STATE_CHANGED';
      } else if (err.message?.includes('DEAL_TOTAL_MISMATCH')) {
        error.value = 'DEAL_TOTAL_MISMATCH';
      } else {
        error.value = tournamentSettlementErrorKey(err);
      }
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
        // 'estimate' resolves a still-pending serverTimestamp createdAt to the
        // local estimate instead of null (a just-created room would otherwise
        // show an empty date until the server ack).
        const data = doc.data({ serverTimestamps: 'estimate' });
        const isHost = data.hostUid === authStore.user.uid;
        const isPlayer = data.players?.some(p => p.uid === authStore.user.uid);
        
        if (isHost || isPlayer) {
          rooms.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      // Sort by creation time, newest first (createdAt is a Firestore
      // Timestamp on new games and epoch millis on legacy ones)
      myRooms.value = rooms.sort(
        (a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt)
      );
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
    listenedGameId = null;
    if (resubscribeTimer) {
      clearTimeout(resubscribeTimer);
      resubscribeTimer = null;
    }
  };

  const clearCurrentGame = () => {
    cleanup();
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
    recordLedgerTx,
    undoLedgerTx,
    settleGame,
    closeGame,
    eliminatePlayer,
    reentryPlayer,
    undoEliminationTx,
    undoReentryTx,
    mysteryDraw,
    mysteryUndoDraw,
    mysteryFinalDraws,
    updateMysteryEnvelopes,
    settleTournament,
    settleTournamentWithDeal,
    clearCurrentGame,
    loadMyRooms,
    cleanup
  };
});
