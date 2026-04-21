/**
 * Time Bank Composable
 * Standalone countdown timer synced via Firestore.
 * Dealer controls; players can view in real-time.
 */

import { ref, computed, onUnmounted } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import { DEFAULT_TIME_BANK_SECONDS, DEFAULT_TIME_BANK_INTERVAL, DEFAULT_TIME_BANK_BUTTON_COUNT } from '../utils/constants.js';

export function useTimeBank() {
  const authStore = useAuthStore();

  const session = ref(null);
  const sessionId = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const localTimeLeft = ref(0);

  let tickInterval = null;
  let unsubscribe = null;

  // ── Computed ────────────────────────────────────────
  const isHost = computed(() => session.value?.hostUid === authStore.user?.uid);
  const config = computed(() => session.value?.config || {});
  const state = computed(() => session.value?.state || {});
  const status = computed(() => state.value.status || 'idle');
  const totalSeconds = computed(() => config.value.totalSeconds || DEFAULT_TIME_BANK_SECONDS);
  const minSeconds = computed(() => config.value.minSeconds || DEFAULT_TIME_BANK_SECONDS);
  const intervalSeconds = computed(() => config.value.intervalSeconds || DEFAULT_TIME_BANK_INTERVAL);
  const buttonCount = computed(() => config.value.buttonCount || DEFAULT_TIME_BANK_BUTTON_COUNT);
  const label = computed(() => config.value.label || 'Time Bank');

  const quickPresets = computed(() => {
    const min = minSeconds.value;
    const interval = intervalSeconds.value;
    const count = buttonCount.value;
    return Array.from({ length: count }, (_, i) => min + i * interval);
  });

  const percentage = computed(() => {
    if (totalSeconds.value <= 0) return 0;
    return Math.max(0, Math.min(100, (localTimeLeft.value / totalSeconds.value) * 100));
  });

  const urgency = computed(() => {
    const pct = percentage.value;
    if (pct > 50) return 'normal';    // white/green
    if (pct > 25) return 'warning';   // yellow
    return 'critical';                // red + pulse
  });

  const formattedTime = computed(() => {
    const t = Math.max(0, localTimeLeft.value);
    const minutes = Math.floor(t / 60);
    const seconds = t % 60;
    if (minutes > 0) {
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    return String(seconds);
  });

  // ── Local tick ──────────────────────────────────────
  function startLocalTick() {
    stopLocalTick();
    tickInterval = setInterval(() => {
      if (status.value !== 'running') return;
      if (!session.value?.state?.lastTickAt) return;

      const lastTick = session.value.state.lastTickAt;
      const lastTickMs = lastTick instanceof Timestamp
        ? lastTick.toMillis()
        : (typeof lastTick === 'number' ? lastTick : Date.now());

      const saved = session.value.state.timeLeftSeconds ?? 0;
      const elapsed = Math.floor((Date.now() - lastTickMs) / 1000);
      localTimeLeft.value = Math.max(0, saved - elapsed);

      // Auto-expire (host marks ended)
      if (localTimeLeft.value <= 0 && isHost.value) {
        expireTimer();
      }
    }, 250); // 250 ms for smoother countdown feel
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

    const docRef = doc(db, 'timeBankSessions', id);
    unsubscribe = onSnapshot(docRef, (snap) => {
      loading.value = false;
      if (snap.exists()) {
        session.value = { id: snap.id, ...snap.data() };
        const st = session.value.state || {};
        if (st.status === 'running') {
          startLocalTick();
        } else {
          localTimeLeft.value = st.timeLeftSeconds ?? 0;
          stopLocalTick();
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

  // ── Host actions ───────────────────────────────────
  async function createSession(cfg) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');

    const colRef = collection(db, 'timeBankSessions');
    const docRef = doc(colRef);
    const min = cfg.minSeconds || DEFAULT_TIME_BANK_SECONDS;
    const interval = cfg.intervalSeconds || DEFAULT_TIME_BANK_INTERVAL;
    const count = cfg.buttonCount || DEFAULT_TIME_BANK_BUTTON_COUNT;

    await setDoc(docRef, {
      hostUid: uid,
      hostName: authStore.user?.displayName || 'Dealer',
      config: {
        totalSeconds: min,
        minSeconds: min,
        intervalSeconds: interval,
        buttonCount: count,
        label: cfg.label || 'Time Bank',
      },
      state: {
        status: 'idle',
        timeLeftSeconds: min,
        lastTickAt: null,
      },
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }

  async function startTimer() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), {
      'state.status': 'running',
      'state.lastTickAt': serverTimestamp(),
    });
  }

  async function pauseTimer() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), {
      'state.status': 'paused',
      'state.timeLeftSeconds': localTimeLeft.value,
      'state.lastTickAt': null,
    });
  }

  async function resetTimer() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), {
      'state.status': 'idle',
      'state.timeLeftSeconds': totalSeconds.value,
      'state.lastTickAt': null,
    });
  }

  async function resetAndStart(seconds = null) {
    if (!sessionId.value || !isHost.value) return;
    const time = seconds || totalSeconds.value;
    const updates = {
      'state.status': 'running',
      'state.timeLeftSeconds': time,
      'state.lastTickAt': serverTimestamp(),
    };
    if (seconds) {
      updates['config.totalSeconds'] = time;
    }
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), updates);
  }

  async function updateConfig(cfg) {
    if (!sessionId.value || !isHost.value) return;
    const min = cfg.minSeconds ?? minSeconds.value;
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), {
      'config.totalSeconds': min,
      'config.minSeconds': min,
      'config.intervalSeconds': cfg.intervalSeconds ?? intervalSeconds.value,
      'config.buttonCount': cfg.buttonCount ?? buttonCount.value,
      'config.label': cfg.label ?? label.value,
      'state.status': 'idle',
      'state.timeLeftSeconds': min,
      'state.lastTickAt': null,
    });
  }

  async function expireTimer() {
    if (!sessionId.value || !isHost.value) return;
    await updateDoc(doc(db, 'timeBankSessions', sessionId.value), {
      'state.status': 'expired',
      'state.timeLeftSeconds': 0,
      'state.lastTickAt': null,
    });
  }

  async function deleteSession() {
    if (!sessionId.value || !isHost.value) return;
    await deleteDoc(doc(db, 'timeBankSessions', sessionId.value));
  }

  // ── Cleanup ────────────────────────────────────────
  function cleanup() {
    stopLocalTick();
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
    session,
    sessionId,
    loading,
    error,
    localTimeLeft,

    isHost,
    config,
    state,
    status,
    totalSeconds,
    minSeconds,
    intervalSeconds,
    buttonCount,
    quickPresets,
    label,
    percentage,
    urgency,
    formattedTime,

    createSession,
    joinSession,
    startTimer,
    pauseTimer,
    resetTimer,
    resetAndStart,
    updateConfig,
    expireTimer,
    deleteSession,
    cleanup,
  };
}
