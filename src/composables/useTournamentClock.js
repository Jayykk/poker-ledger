/**
 * Tournament Clock Composable
 * Manages tournament session state via Firestore real-time sync.
 * The host writes state; viewers compute countdown locally.
 */

import { ref, computed, onUnmounted } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, Timestamp, increment,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import {
  DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
} from '../utils/constants.js';
import {
  computeEntries,
  computeChipsInPlay,
  computeAverageStack,
  computeAverageStackBB,
} from '../utils/tournamentStats.js';

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
  const localLevelIndex = ref(0);
  let tickInterval = null;
  let unsubscribe = null;
  let unsubscribeGame = null;
  let isAdvancing = false;
  let isCatchupSyncing = false;
  let lastSyncedLevelIndex = -1;
  const MAX_ACCEPTABLE_DRIFT_SECONDS = 2;

  // ── Computed ────────────────────────────────────────
  const isHost = computed(() => {
    if (dealerMode) return true;
    return session.value?.hostUid === authStore.user?.uid;
  });

  const config = computed(() => session.value?.config || {});
  const state = computed(() => session.value?.state || {});

  const currentLevelIndex = computed(() => {
    if (state.value.status === 'running' && state.value.lastTickAt) {
      return localLevelIndex.value;
    }
    return state.value.currentLevelIndex ?? 0;
  });

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
  const entries = computed(() => computeEntries(playersRegistered.value, reentries.value));
  const chipsInPlay = computed(() => {
    return computeChipsInPlay(entries.value, config.value.startingChips || 0);
  });
  const averageStack = computed(() => {
    return computeAverageStack(chipsInPlay.value, playersRemaining.value);
  });
  const averageStackBB = computed(() => {
    return computeAverageStackBB(chipsInPlay.value, playersRemaining.value, currentBlinds.value.big);
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

  function normalizeLevelIndex(index) {
    const maxIdx = Math.max(0, levels.value.length - 1);
    const parsed = Number.isFinite(Number(index)) ? Math.floor(Number(index)) : 0;
    return Math.min(Math.max(0, parsed), maxIdx);
  }

  function getLevelDurationSeconds(levelIndex) {
    const minutes = levels.value[levelIndex]?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION;
    return Math.max(1, Math.floor(Number(minutes) * 60));
  }

  function resolveRunningState(st) {
    const totalLevels = levels.value.length;
    const startLevelIndex = normalizeLevelIndex(st.currentLevelIndex ?? 0);
    const startTimeLeft = Math.max(0, Math.floor(Number(st.timeLeftSeconds ?? 0)));
    const seedDuration = totalLevels > 0 ? getLevelDurationSeconds(startLevelIndex) : getLevelDurationSeconds(0);
    const seedTimeLeft = startTimeLeft > 0 ? startTimeLeft : seedDuration;

    const rawLastTick = st.lastTickAt;
    const lastTickMs = rawLastTick instanceof Timestamp
      ? rawLastTick.toMillis()
      : (typeof rawLastTick?.toMillis === 'function'
        ? rawLastTick.toMillis()
        : (typeof rawLastTick === 'number' ? rawLastTick : Date.now()));
    const elapsed = Math.max(0, Math.floor((Date.now() - lastTickMs) / 1000));

    if (elapsed < seedTimeLeft) {
      return {
        levelIndex: startLevelIndex,
        timeLeftSeconds: seedTimeLeft - elapsed,
      };
    }

    let overshoot = elapsed - seedTimeLeft;

    // No level definition: keep cycling with default duration.
    if (totalLevels === 0) {
      const cycle = getLevelDurationSeconds(0);
      const inCycle = overshoot % cycle;
      return {
        levelIndex: 0,
        timeLeftSeconds: cycle - inCycle,
      };
    }

    let idx = startLevelIndex + 1;
    while (idx < totalLevels) {
      const duration = getLevelDurationSeconds(idx);
      if (overshoot < duration) {
        return {
          levelIndex: idx,
          timeLeftSeconds: duration - overshoot,
        };
      }
      overshoot -= duration;
      idx += 1;
    }

    // After the final level, repeat the last level forever.
    const lastIdx = totalLevels - 1;
    const lastDuration = getLevelDurationSeconds(lastIdx);
    const inLastCycle = overshoot % lastDuration;
    return {
      levelIndex: lastIdx,
      timeLeftSeconds: lastDuration - inLastCycle,
    };
  }

  async function syncRunningStateToServer(st) {
    if (!sessionId.value || !isHost.value || isCatchupSyncing) return;

    const resolved = resolveRunningState(st);
    const storedLevelIndex = normalizeLevelIndex(st.currentLevelIndex ?? 0);

    // Keep writes minimal: only persist when running state has crossed levels.
    if (resolved.levelIndex === storedLevelIndex) return;

    isCatchupSyncing = true;
    try {
      await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
        'state.currentLevelIndex': resolved.levelIndex,
        'state.timeLeftSeconds': resolved.timeLeftSeconds,
        'state.lastTickAt': serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[TournamentClock] running-state catch-up failed:', err);
    } finally {
      isCatchupSyncing = false;
    }
  }

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
    const st = session.value?.state;
    if (!st) return;

    if (st.status !== 'running' || !st.lastTickAt) {
      localLevelIndex.value = normalizeLevelIndex(st.currentLevelIndex ?? 0);
      localTimeLeft.value = Math.max(0, Math.floor(Number(st.timeLeftSeconds ?? 0)));
      return;
    }

    const resolved = resolveRunningState(st);
    localLevelIndex.value = resolved.levelIndex;
    localTimeLeft.value = resolved.timeLeftSeconds;
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
          lastSyncedLevelIndex = st.currentLevelIndex ?? -1;

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
            const prevLocalLevelIndex = localLevelIndex.value;
            computeTimeLeft();
            const drift = Math.abs(prevLocal - localTimeLeft.value);
            if (drift <= MAX_ACCEPTABLE_DRIFT_SECONDS && localLevelIndex.value === prevLocalLevelIndex) {
              // Small drift from server timestamp estimate update — keep local value
              localTimeLeft.value = prevLocal;
              localLevelIndex.value = prevLocalLevelIndex;
            }
            // tick is already running, no need to restart
          }

          syncRunningStateToServer(st);
        } else {
          lastSyncedLevelIndex = st.currentLevelIndex ?? -1;
          localLevelIndex.value = normalizeLevelIndex(st.currentLevelIndex ?? 0);
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

      // Deduplicate by uid (if present) then by id to guard against double-join edge cases
      const seen = new Set();
      const uniquePlayers = players.filter(p => {
        const key = p.uid || p.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const playerCount = uniquePlayers.length;
      const eliminatedCount = uniquePlayers.filter(p => p.eliminated).length;
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
      'state.currentLevelIndex': localLevelIndex.value,
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
    await updateDoc(doc(db, 'tournamentSessions', sessionId.value), {
      'state.reentries': increment(1),
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
