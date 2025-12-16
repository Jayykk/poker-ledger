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
        const joinSeat = httpsCallable(functions, 'joinPokerSeat');
        
        const result = await joinSeat({ gameId, seatNumber, buyIn });
        
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
     * Leave current poker game
     */
    async leaveSeat() {
      if (!this.gameId) return;

      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        const leaveSeat = httpsCallable(functions, 'leavePokerSeat');
        
        await leaveSeat({ gameId: this.gameId });
        
        this.stopListeners();
        this.currentGame = null;
        this.gameId = null;
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
     */
    async performAction(action, amount = 0) {
      if (!this.gameId) return;

      this.loading = true;
      this.error = null;

      try {
        const functions = getFunctions(app);
        const playerAction = httpsCallable(functions, 'pokerPlayerAction');
        
        const result = await playerAction({
          gameId: this.gameId,
          action,
          amount,
        });
        
        return result.data.result;
      } catch (error) {
        console.error('Error performing action:', error);
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
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
     * Start listening to game updates
     */
    async joinGameListener(gameId, userId) {
      // Stop existing listeners
      this.stopListeners();

      this.gameId = gameId;

      // Listen to game state
      const gameRef = doc(db, 'pokerGames', gameId);
      this.gameUnsubscribe = onSnapshot(gameRef, async (snapshot) => {
        if (snapshot.exists()) {
          const gameData = {
            id: snapshot.id,
            ...snapshot.data(),
          };
          
          this.currentGame = gameData;
          
          // If game just ended, settle it automatically
          // Only settle once - check if not already completed
          if (gameData.status === 'ended' && !gameData.completedAt && !gameData.settling) {
            try {
              // Mark as settling to prevent race conditions
              await doc(db, 'pokerGames', gameId).update({ settling: true });
              await this.settleGame(gameId);
            } catch (error) {
              console.error('Auto-settle failed:', error);
              // Clear settling flag on error
              await doc(db, 'pokerGames', gameId).update({ settling: false });
            }
          }
        }
      });

      // Listen to private hole cards (if userId provided)
      if (userId) {
        const privateRef = doc(db, 'pokerGames', gameId, 'private', userId);
        this.privateUnsubscribe = onSnapshot(privateRef, (snapshot) => {
          if (snapshot.exists()) {
            this.myHoleCards = snapshot.data().holeCards || [];
          }
        });
      }
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
