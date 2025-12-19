/**
 * Poker Game Store Module
 * Manages state for online Texas Hold'em poker games
 */

import { defineStore } from 'pinia';
import { db, app } from '../../firebase-init.js';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuthStore } from './auth.js';

export const usePokerStore = defineStore('poker', {
  state: () => ({
    // Current game state
    currentGame: null,
    gameId: null,
    myHoleCards: [],
    
    // UI state
    loading: false,
    error: null,
    
    // Real-time listeners
    gameUnsubscribe: null,
    privateUnsubscribe: null,
  }),

  getters: {
    /**
     * Check if player is in current game
     */
    isInGame: (state) => !!state.currentGame,

    /**
     * Get player's seat information
     */
    mySeat: (state) => {
      if (!state.currentGame) return null;
      
      const authStore = useAuthStore();
      const userId = authStore.user?.uid;
      if (!userId) return null;
      
      return Object.values(state.currentGame.seats || {})
        .find((seat) => seat && seat.odId === userId);
    },

    /**
     * Get list of active players
     */
    activePlayers: (state) => {
      if (!state.currentGame) return [];
      
      return Object.entries(state.currentGame.seats || {})
        .filter(([, seat]) => seat !== null)
        .map(([seatNum, seat]) => ({ seatNum: parseInt(seatNum), ...seat }));
    },

    /**
     * Check if it's my turn
     */
    isMyTurn: (state) => {
      if (!state.currentGame) return false;
      
      const authStore = useAuthStore();
      const userId = authStore.user?.uid;
      return state.currentGame.table?.currentTurn === userId;
    },

    /**
     * Get current pot size
     */
    potSize: (state) => {
      return state.currentGame?.table?.pot || 0;
    },

    /**
     * Get community cards
     */
    communityCards: (state) => {
      return state.currentGame?.table?.communityCards || [];
    },

    /**
     * Get current betting round
     */
    currentRound: (state) => {
      return state.currentGame?.table?.currentRound || 'waiting';
    },
  },

  actions: {
    /**
     * Create a new poker game room
     */
    async createGame(config) {
      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        const createRoom = httpsCallable(functions, 'createPokerRoom');
        
        const result = await createRoom({ config });
        
        if (result.data.success) {
          this.gameId = result.data.room.id;
          await this.joinGameListener(result.data.room.id);
          return result.data.room;
        }
      } catch (error) {
        console.error('Error creating game:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Join a poker game seat
     */
    async joinSeat(gameId, seatNumber, buyIn) {
      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        
        // Use sitDown endpoint (works for both waiting and playing games)
        const sitDown = httpsCallable(functions, 'sitDownPokerSeat');
        
        const result = await sitDown({ gameId, seatNumber, buyIn });
        
        if (result.data.success) {
          // Start listening to game updates if not already
          if (!this.gameUnsubscribe) {
            await this.joinGameListener(gameId);
          }
          return result.data.result;
        }
      } catch (error) {
        console.error('Error joining seat:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Leave current poker seat (but stay in room as spectator)
     */
    async leaveSeat() {
      if (!this.gameId) return;

      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        const leaveSeat = httpsCallable(functions, 'leavePokerSeat');
        
        await leaveSeat({ gameId: this.gameId });
        
        // DON'T stop listeners or clear game - stay in room as spectator
        // Only clear hole cards since we're no longer seated
        this.myHoleCards = [];
      } catch (error) {
        console.error('Error leaving seat:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Start a new hand
     */
    async startHand() {
      if (!this.gameId) return;

      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        const startHand = httpsCallable(functions, 'startPokerHand');
        
        const result = await startHand({ gameId: this.gameId });
        return result.data.result;
      } catch (error) {
        console.error('Error starting hand:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Perform player action
     * Now includes turnId for concurrency control and supports optimistic updates
     */
    async performAction(action, amount = 0, options = {}) {
      if (!this.gameId) return;

      // Removed global loading state to prevent full-screen spinner during game actions
      this.error = null;

      const { optimistic = false } = options;

      // For optimistic calls, return immediately without waiting for API response
      if (optimistic) {
        // Apply optimistic UI updates for All-In to avoid "lag then teleport"
        // when the backend immediately auto-runs out the board.
        if (action === 'all_in' && this.currentGame?.seats && this.currentGame?.table) {
          const authStore = useAuthStore();
          const userId = authStore.user?.uid;

          if (userId) {
            let mySeatNum = null;
            let mySeat = null;
            for (const [seatNum, seat] of Object.entries(this.currentGame.seats)) {
              if (seat && seat.odId === userId) {
                mySeatNum = seatNum;
                mySeat = seat;
                break;
              }
            }

            const myChips = mySeat?.chips || 0;
            if (mySeatNum !== null && mySeat && myChips > 0) {
              const currentBet = mySeat.roundBet ?? mySeat.currentBet ?? 0;
              const nextSeats = { ...this.currentGame.seats };
              nextSeats[mySeatNum] = {
                ...mySeat,
                roundBet: currentBet + myChips,
                chips: 0,
                status: 'all_in',
              };

              // Visually bridge the pot jump: move chips into pot immediately.
              const nextPot = (this.currentGame.table.pot || 0) + myChips;

              this.currentGame = {
                ...this.currentGame,
                seats: nextSeats,
                table: {
                  ...this.currentGame.table,
                  pot: nextPot,
                },
              };
            }
          }
        }

        // Fire the API call in the background
        const functions = getFunctions(app);
        const playerAction = httpsCallable(functions, 'pokerPlayerAction');
        const turnId = this.currentGame?.table?.currentTurnId;

        const requestPromise = playerAction({
          gameId: this.gameId,
          action,
          amount,
          turnId,
        });

        // Attach a logger to avoid silent failures, but still allow callers to handle errors.
        requestPromise.catch((error) => {
          console.error(`Optimistic action failed [gameId: ${this.gameId}, action: ${action}]:`, error);
        });

        return requestPromise; // Return immediately for optimistic updates
      }

      // Standard (non-optimistic) path
      try {
        const functions = getFunctions(app);
        const playerAction = httpsCallable(functions, 'pokerPlayerAction');
        
        // 🔑 Include currentTurnId for validation
        const turnId = this.currentGame?.table?.currentTurnId;
        
        const result = await playerAction({
          gameId: this.gameId,
          action,
          amount,
          turnId,  // ✨ NEW: Include turnId
        });
        
        return result.data.result;
      } catch (error) {
        console.error('Error performing action:', error);
        
        // Extract error code from Firebase Functions error
        // Firebase Functions errors have the format: code/message
        // For structured errors, the message is the error code
        if (error.code === 'functions/failed-precondition') {
          // This is a structured error, message contains the error code
          const errorCode = error.message;
          
          // Handle STALE_ACTION error specifically
          if (errorCode === 'STALE_ACTION') {
            // This action was stale, the UI should already reflect the new state
            console.log('Stale action detected, ignoring');
            return;
          }
          
          const enhancedError = new Error(errorCode);
          enhancedError.code = errorCode;
          enhancedError.details = error.details;
          this.error = errorCode;
          throw enhancedError;
        }
        
        this.error = error.message;
        throw error;
      }
    },

    /**
     * End game after current hand
     */
    async endGameAfterHand(gameId) {
      try {
        const functions = getFunctions(app);
        const endAfterHand = httpsCallable(functions, 'setEndAfterHand');
        
        await endAfterHand({ gameId });
      } catch (error) {
        console.error('Error setting end after hand:', error);
        throw error;
      }
    },

    /**
     * Settle poker game and save to history
     */
    async settleGame(gameId) {
      try {
        const functions = getFunctions(app);
        const settleGame = httpsCallable(functions, 'settlePokerGame');
        
        await settleGame({ gameId });
      } catch (error) {
        console.error('Error settling game:', error);
        throw error;
      }
    },

    /**
     * Delete a poker room (only creator can delete)
     */
    async deleteRoom(gameId) {
      try {
        const functions = getFunctions(app);
        const deleteRoom = httpsCallable(functions, 'deletePokerRoom');
        
        await deleteRoom({ gameId });
        
        // Clean up local state
        this.stopListeners();
        this.currentGame = null;
        this.gameId = null;
        this.myHoleCards = [];
      } catch (error) {
        console.error('Error deleting room:', error);
        throw error;
      }
    },

    /**
     * Resume a paused game (host only)
     */
    async resumeGame(gameId) {
      try {
        const functions = getFunctions(app);
        const resumeGame = httpsCallable(functions, 'resumePokerGame');
        
        await resumeGame({ gameId });
      } catch (error) {
        console.error('Error resuming game:', error);
        throw error;
      }
    },

    /**
     * Toggle pause/resume game (host only)
     */
    async togglePause(gameId) {
      try {
        const functions = getFunctions(app);
        const togglePause = httpsCallable(functions, 'togglePausePokerGame');
        
        await togglePause({ gameId });
      } catch (error) {
        console.error('Error toggling pause:', error);
        throw error;
      }
    },

    /**
     * Stop auto-next hand (host only)
     */
    async stopNextHand(gameId) {
      try {
        const functions = getFunctions(app);
        const stopNextHand = httpsCallable(functions, 'stopNextPokerHand');
        
        await stopNextHand({ gameId });
      } catch (error) {
        console.error('Error stopping next hand:', error);
        throw error;
      }
    },

    /**
     * Start listening to game updates
     */
    async joinGameListener(gameId, userId) {
      // Stop existing listeners
      this.stopListeners();

      this.gameId = gameId;

      const maybeStartPrivateListener = () => {
        if (this.privateUnsubscribe) return;

        const authStore = useAuthStore();
        const resolvedUserId = userId || authStore.user?.uid;
        if (!resolvedUserId) return;

        const privateRef = doc(db, 'pokerGames', gameId, 'private', resolvedUserId);
        this.privateUnsubscribe = onSnapshot(privateRef, (snapshot) => {
          if (snapshot.exists()) {
            this.myHoleCards = snapshot.data().holeCards || [];
          } else {
            this.myHoleCards = [];
          }
        });
      };

      // Listen to game state
      const gameRef = doc(db, 'pokerGames', gameId);
      this.gameUnsubscribe = onSnapshot(gameRef, async (snapshot) => {
        if (snapshot.exists()) {
          const gameData = {
            id: snapshot.id,
            ...snapshot.data(),
          };
          
          this.currentGame = gameData;

          // If auth becomes available after initial mount, attach private listener lazily.
          maybeStartPrivateListener();
          
          // If game just ended, settle it automatically
          // Only settle once - check if not already completed
          if (gameData.status === 'ended' && !gameData.completedAt && !gameData.settling) {
            try {
              // Mark as settling to prevent race conditions
              await updateDoc(doc(db, 'pokerGames', gameId), { settling: true });
              await this.settleGame(gameId);
            } catch (error) {
              console.error('Auto-settle failed:', error);
              // Clear settling flag on error
              await updateDoc(doc(db, 'pokerGames', gameId), { settling: false });
            }
          }
        }
      });

      // Try to attach private listener immediately (if userId or auth is ready)
      maybeStartPrivateListener();
    },

    /**
     * Stop all real-time listeners
     */
    stopListeners() {
      if (this.gameUnsubscribe) {
        this.gameUnsubscribe();
        this.gameUnsubscribe = null;
      }
      if (this.privateUnsubscribe) {
        this.privateUnsubscribe();
        this.privateUnsubscribe = null;
      }
    },

    /**
     * Get available poker games
     */
    async getAvailableGames() {
      try {
        const gamesRef = collection(db, 'pokerGames');
        const q = query(
          gamesRef,
          where('status', 'in', ['waiting', 'playing']),
        );
        
        const snapshot = await getDocs(q);
        const games = [];
        
        snapshot.forEach((doc) => {
          games.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        
        return games;
      } catch (error) {
        console.error('Error getting games:', error);
        throw error;
      }
    },
  },
});
