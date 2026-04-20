/**
 * Tournament Clock Composable
 * Manages tournament session state via Firestore real-time sync.
 * The host writes state; viewers compute countdown locally.
 */

import { ref, computed, onUnmounted, watch } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import {
  DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
} from '../utils/constants.js';

export function useTournamentClock(options = {}) {
  const { dealerMode = false } = options;
  const authStore = useAuthStore();

  // ── Reactive state ──────────────────────────────────
  const session = ref(null);
  const sessionId = ref(null);
  const loading = ref(false);
  const error = ref(null);

  // Local countdown driven by requestAnimationFrame / setInterval
  const localTimeLeft = ref(0);
  let tickInterval = null;
  let unsubscribe = null;
  let unsubscribeGame = null;
  let isAdvancing = false;
  let lastSyncedLevelIndex = -1;

  // ── Computed ────────────────────────────────────────
  const isHost = computed(() => {
    if (dealerMode) return true;
    return session.value?.hostUid === authStore.user?.uid;
  });

  const config = computed(() => session.value?.config || {});
  const state = computed(() => session.value?.state || {});

  const currentLevelIndex = computed(() => state.value.currentLevelIndex ?? 0);

  const levels = computed(() => config.value.levels || []);

  const currentLevelEntry = computed(() => {
    return levels.value[currentLevelIndex.value] || null;
  });

  const nextPlayLevelEntry = computed(() => {
    const all = levels.value;
    for (let i = currentLevelIndex.value + 1; i < all.length; i++) {
      if (!all[i].isBreak) return all[i];
    }
    return null;
  });

  const nextLevelEntry = computed(() => {
    return levels.value[currentLevelIndex.value + 1] || null;
  });

  const isBreak = computed(() => currentLevelEntry.value?.isBreak === true);

  const currentBlinds = computed(() => {
    const entry = currentLevelEntry.value;
    if (!entry || entry.isBreak) return { small: 0, big: 0, ante: 0 };
    return { small: entry.small, big: entry.big, ante: entry.ante || 0 };
  });

  const currentLevel = computed(() => {
    const entry = currentLevelEntry.value;
    return entry?.isBreak ? 0 : (entry?.level ?? 0);
  });

  const status = computed(() => state.value.status || 'waiting');

  const playersRegistered = computed(() => state.value.playersRegistered ?? 0);
  const playersRemaining = computed(() => state.value.playersRemaining ?? 0);
  const reentries = computed(() => state.value.reentries ?? 0);
  const entries = computed(() => playersRegistered.value + reentries.value);
  const chipsInPlay = computed(() => {
    return entries.value * (config.value.startingChips || 0);
  });
  const averageStack = computed(() => {
    if (playersRemaining.value <= 0) return 0;
    return Math.round(chipsInPlay.value / playersRemaining.value);
  });
  const averageStackBB = computed(() => {
    const bb = currentBlinds.value.big;
    if (!bb || bb <= 0) return 0;
    return Math.round(averageStack.value / bb);
  });

  const isRegistrationClosed = computed(() => {
    const cutoff = config.value.reentryUntilLevel || 0;
    if (cutoff <= 0) return false;
    return currentLevel.value >= cutoff;
  });

  const prizePool = computed(() => {
    return entries.value * (config.value.buyIn || 0);
  });

  const payouts = computed(() => {
    const ratios = config.value.payoutRatios || [];
    const pool = prizePool.value;
    return ratios.map((r) => ({
      place: r.place,
      amount: Math.round(pool * r.percentage / 100),
    }));
  });

  const formattedTime = computed(() => {
    const t = Math.max(0, localTimeLeft.value);
    const minutes = Math.floor(t / 60);
    const seconds = t % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  // Time until next break
  const timeToBreak = computed(() => {
    const all = levels.value;
    const idx = currentLevelIndex.value;
    let seconds = localTimeLeft.value;
    for (let i = idx + 1; i < all.length; i++) {
      if (all[i].isBreak) break;
      seconds += (all[i].duration || 0) * 60;
    }
    // If current is already a break or no break ahead, return null
    if (isBreak.value) return null;
    const hasBreakAhead = all.slice(idx + 1).some((l) => l.isBreak);
    if (!hasBreakAhead) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  // ── Local tick (1 Hz) ───────────────────────────────
  function computeTimeLeft() {
    if (!session.value?.state?.lastTickAt) return;
    const lastTick = session.value.state.lastTickAt;
    const lastTickMs = lastTick instanceof Timestamp
      ? lastTick.toMillis()
      : (typeof lastTick === 'number' ? lastTick : Date.now());
    const savedTimeLeft = session.value.state.timeLeftSeconds ?? 0;
    const elapsed = Math.floor((Date.now() - lastTickMs) / 1000);
    localTimeLeft.value = Math.max(0, savedTimeLeft - elapsed);
  }

  function startLocalTick() {
    stopLocalTick();
    tickInterval = setInterval(() => {
      if (status.value !== 'running') return;
      computeTimeLeft();

      // Auto-advance or repeat last level when time runs out (host only)
      if (localTimeLeft.value <= 0 && isHost.value && !isAdvancing) {
        const nextIdx = currentLevelIndex.value + 1;
        if (nextIdx < levels.value.length) {
          isAdvancing = true;
          advanceLevel().finally(() => { isAdvancing = false; });
        } else {
          // Last level: restart timer with same level duration
          isAdvancing = true;
          repeatCurrentLevel().finally(() => { isAdvancing = false; });
        }
      }
    }, 1000);
  }

  function stopLocalTick() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  // ── Firestore listener ─────────────────────────────
  function joinSession(id) {
    cleanup();
    sessionId.value = id;
    loading.value = true;

    const docRef = doc(db, 'tournamentSessions', id);
    unsubscribe = onSnapshot(docRef, (snap) => {
      loading.value = false;
      if (snap.exists()) {
        session.value = { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) };

        // Sync local countdown from server state
        const st = session.value.state || {};
        if (st.status === 'running' && st.lastTickAt) {
          const levelChanged = st.currentLevelIndex !== lastSyncedLevelIndex;
          lastSyncedLevelIndex = st.currentLevelIndex;

          if (levelChanged) {
            // Level changed: always resync from server
            computeTimeLeft();
            startLocalTick();
          } else if (!tickInterval) {
            // Tick not running yet: initial sync
            computeTimeLeft();
            startLocalTick();
          } else {
            // Same level, tick already running: only resync if drift > 2s
            const prevLocal = localTimeLeft.value;
            computeTimeLeft();
            const drift = Math.abs(prevLocal - localTimeLeft.value);
            if (drift <= 2) {
              // Small drift from server timestamp estimate update — keep local value
              localTimeLeft.value = prevLocal;
            }
            // tick is already running, no need to restart
          }
        } else {
          lastSyncedLevelIndex = st.currentLevelIndex ?? -1;
          localTimeLeft.value = st.timeLeftSeconds ?? 0;
          stopLocalTick();
        }

        // Start syncing game room players if linked
        if (session.value.gameId && !unsubscribeGame) {
          startGameSync(session.value.gameId);
        }
      } else {
        session.value = null;
        error.value = 'Session not found';
      }
    }, (err) => {
      loading.value = false;
      error.value = err.message;
    });
  }

  // ── Game room player sync ──────────────────────────
  function startGameSync(gameId) {
    stopGameSync();
    const gameRef = doc(db, 'games', gameId);
    unsubscribeGame = onSnapshot(gameRef, (snap) => {
      if (!snap.exists() || !isHost.value || !sessionId.value) return;
      const gameData = snap.data();
      const players = gameData.players || [];
      const playerCount = players.length;
      const eliminatedCount = players.filter(p => p.eliminated).length;
      const aliveCount = playerCount - eliminatedCount;

      const currentRegistered = session.value?.state?.playersRegistered ?? 0;
      const currentRemaining = session.value?.state?.playersRemaining ?? 0;
      // Sync when player count or alive count diverges
      if (playerCount !== currentRegistered || aliveCount !== currentRemaining) {
        updatePlayers(playerCount, aliveCount);
      }
    });
  }

  function stopGameSync() {
    if (unsubscribeGame) {
      unsubscribeGame();
      unsubscribeGame = null;
    }
  }

  // ── Host actions ───────────────────────────────────
  async function createSession(config) {
    const uid = authStore.user?.uid;
    const name = authStore.user?.displayName || 'Host';
    if (!uid) throw new Error('Not authenticated');

    const colRef = collection(db, 'tournamentSessions');
    const docRef = doc(colRef);
    const firstLevel = config.levels?.[0];

    const data = {
      hostUid: uid,
      hostName: name,
      gameId: config.gameId || null,
      dealerModeEnabled: false,
      config: {
        name: config.name || 'Tournament',
        subtitle: config.subtitle || '',
        buyIn: config.buyIn || 0,
        startingChips: config.startingChips || DEFAULT_STARTING_CHIPS,
        reentryUntilLevel: config.reentryUntilLevel || DEFAULT_REENTRY_LEVEL,
        maxReentries: config.maxReentries ?? 0,
        levels: config.levels || [],
        payoutRatios: config.payoutRatios || [],
      },
      state: {
        status: 'waiting',
        currentLevelIndex: 0,
        timeLeftSeconds: (firstLevel?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION) * 60,
        lastTickAt: null,
        playersRegistered: 0,
        playersRemaining: 0,
        reentries: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(docRef, data);
    return docRef.id;
  }

  async function startClock() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.status': 'running',
      'state.lastTickAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function pauseClock() {
    if (!sessionId.value || !isHost.value) return;
    // Save the current localTimeLeft so viewers resume correctly
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.status': 'paused',
      'state.timeLeftSeconds': localTimeLeft.value,
      'state.lastTickAt': null,
      updatedAt: serverTimestamp(),
    });
  }

  async function advanceLevel() {
    if (!sessionId.value || !isHost.value) return;
    const nextIdx = currentLevelIndex.value + 1;
    if (nextIdx >= levels.value.length) return; // Already on last level

    const nextLevel = levels.value[nextIdx];
    const wasRunning = status.value === 'running';
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.currentLevelIndex': nextIdx,
      'state.timeLeftSeconds': (nextLevel.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION) * 60,
      'state.lastTickAt': wasRunning ? serverTimestamp() : null,
      'state.status': wasRunning ? 'running' : 'paused',
      updatedAt: serverTimestamp(),
    });
  }

  async function repeatCurrentLevel() {
    if (!sessionId.value || !isHost.value) return;
    const current = currentLevelEntry.value;
    const duration = (current?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION) * 60;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.timeLeftSeconds': duration,
      'state.lastTickAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function previousLevel() {
    if (!sessionId.value || !isHost.value) return;
    const prevIdx = Math.max(0, currentLevelIndex.value - 1);
    const prevLevel = levels.value[prevIdx];
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.currentLevelIndex': prevIdx,
      'state.timeLeftSeconds': (prevLevel?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION) * 60,
      'state.status': 'paused',
      'state.lastTickAt': null,
      updatedAt: serverTimestamp(),
    });
  }

  async function updatePlayers(registered, remaining) {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.playersRegistered': registered,
      'state.playersRemaining': remaining,
      updatedAt: serverTimestamp(),
    });
  }

  async function addReentry() {
    if (!sessionId.value || !isHost.value) return;
    const current = reentries.value;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.reentries': current + 1,
      'state.playersRegistered': playersRegistered.value + 1,
      updatedAt: serverTimestamp(),
    });
  }

  async function endTournament() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.status': 'ended',
      'state.timeLeftSeconds': 0,
      'state.lastTickAt': null,
      updatedAt: serverTimestamp(),
    });
  }

  async function deleteSession() {
    if (!sessionId.value || !isHost.value) return;
    await deleteDoc(doc(db, 'tournamentSessions', sessionId.value));
  }

  async function toggleDealerMode(enabled) {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      dealerModeEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
  }

  const dealerModeEnabled = computed(() => session.value?.dealerModeEnabled === true);

  // ── Preset CRUD ────────────────────────────────────
  async function savePreset(presetData, presetId = null) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    const colRef = collection(db, 'users', uid, 'tournamentPresets');
    const docRef = presetId ? doc(colRef, presetId) : doc(colRef);
    await setDoc(docRef, {
      ...presetData,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return docRef.id;
  }

  async function deletePreset(presetId) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(db, 'users', uid, 'tournamentPresets', presetId));
  }

  function listenPresets(callback) {
    const uid = authStore.user?.uid;
    if (!uid) return () => {};
    const colRef = collection(db, 'users', uid, 'tournamentPresets');
    return onSnapshot(colRef, (snap) => {
      const presets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(presets);
    });
  }

  // ── Cleanup ────────────────────────────────────────
  function cleanup() {
    stopLocalTick();
    stopGameSync();
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    session.value = null;
    sessionId.value = null;
    error.value = null;
  }

  onUnmounted(cleanup);

  return {
    // State
    session,
    sessionId,
    loading,
    error,
    localTimeLeft,

    // Computed
    isHost,
    config,
    state,
    status,
    currentLevel,
    currentLevelIndex,
    currentLevelEntry,
    currentBlinds,
    nextPlayLevelEntry,
    nextLevelEntry,
    isBreak,
    levels,
    playersRegistered,
    playersRemaining,
    reentries,
    entries,
    chipsInPlay,
    averageStack,
    averageStackBB,
    isRegistrationClosed,
    prizePool,
    payouts,
    formattedTime,
    timeToBreak,
    dealerModeEnabled,

    // Actions
    createSession,
    joinSession,
    startClock,
    pauseClock,
    advanceLevel,
    previousLevel,
    updatePlayers,
    addReentry,
    endTournament,
    deleteSession,
    toggleDealerMode,
    cleanup,

    // Presets
    savePreset,
    deletePreset,
    listenPresets,
  };
}
