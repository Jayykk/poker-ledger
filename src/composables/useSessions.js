/**
 * Sessions Composable
 * Manages the live-event (Session) layer via Firestore real-time sync, mirroring
 * the client-direct pattern used by the cash ledger (`games`) and tournament
 * clock (`tournamentSessions`). A Session sits ABOVE existing live tables: it
 * holds the RSVP roster and an ordered queue of tables that are created lazily
 * — only the currently-active table exists as a real `games` /
 * `tournamentSessions` document; the rest are plan snapshots.
 *
 * No Cloud Functions: RSVP cap is enforced atomically with runTransaction.
 * Activation reuses the existing createGame / createTournamentSession APIs.
 */

import { ref, computed, onUnmounted } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, getDoc, setDoc, updateDoc,
  onSnapshot, serverTimestamp, runTransaction, query, where,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import { useGameStore } from '../store/modules/game.js';
import { useTournamentClock } from './useTournamentClock.js';
import { GAME_TYPE } from '../utils/constants.js';
import { defaultSessionName, aggregateSessionSummary } from '../utils/sessionFlow.js';

export function useSessions() {
  const authStore = useAuthStore();
  const gameStore = useGameStore();
  const clock = useTournamentClock();

  // ── Reactive state ──────────────────────────────────
  const session = ref(null);
  const sessionId = ref(null);
  const loading = ref(false);
  const error = ref(null);
  let unsubscribe = null;

  const isHost = computed(() => !!session.value && session.value.hostUid === authStore.user?.uid);

  // ── Helpers ─────────────────────────────────────────
  function requireUser() {
    const u = authStore.user;
    if (!u) throw new Error('Not authenticated');
    return u;
  }

  function rosterEntry(u) {
    return {
      uid: u.uid,
      name: authStore.displayName,
      avatar: u.photoURL || null,
      joinedAtMs: Date.now(),
    };
  }

  /** Normalise a queue editor list into stored tableQueue rows. */
  function buildQueue(rawQueue = []) {
    return rawQueue.map((e, i) => ({
      order: i,
      kind: e.kind === 'tournament' ? 'tournament' : 'cash',
      label: e.label || '',
      presetSnapshot: e.presetSnapshot || {},
      gameId: e.gameId || null,
      tournamentSessionId: e.tournamentSessionId || null,
      status: e.status || 'queued',
    }));
  }

  // ── Create / edit ───────────────────────────────────
  async function createSession(form) {
    const u = requireUser();
    loading.value = true;
    error.value = null;
    try {
      const ref_ = doc(collection(db, 'sessions'));
      const host = rosterEntry(u);
      await setDoc(ref_, {
        name: form.name || defaultSessionName(Date.now()),
        hostUid: u.uid,
        hostName: authStore.displayName,
        dateTimeMs: Number(form.dateTimeMs) || Date.now(),
        maxPlayers: Number(form.maxPlayers) || 8,
        location: {
          name: form.location?.name || '',
          showToJoinedOnly: !!form.location?.showToJoinedOnly,
        },
        status: 'scheduling',
        roster: [host],
        rosterUids: [u.uid],
        tableQueue: buildQueue(form.tableQueue),
        currentTableIndex: -1,
        activeTable: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref_.id;
    } catch (err) {
      console.error('Create session error:', err);
      error.value = err.message;
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** Host-only edit of basic info + the still-queued portion of the table plan. */
  async function updateSession(id, patch) {
    const ref_ = doc(db, 'sessions', id);
    const data = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.dateTimeMs !== undefined) data.dateTimeMs = Number(patch.dateTimeMs) || Date.now();
    if (patch.maxPlayers !== undefined) data.maxPlayers = Number(patch.maxPlayers) || 8;
    if (patch.location !== undefined) {
      data.location = {
        name: patch.location?.name || '',
        showToJoinedOnly: !!patch.location?.showToJoinedOnly,
      };
    }
    if (patch.tableQueue !== undefined) data.tableQueue = buildQueue(patch.tableQueue);
    await updateDoc(ref_, data);
  }

  /** Host-only queue reorder/add/remove. Active/done entries must be preserved. */
  async function updateQueue(id, newQueue) {
    await updateDoc(doc(db, 'sessions', id), {
      tableQueue: buildQueue(newQueue),
      updatedAt: serverTimestamp(),
    });
  }

  // ── Realtime subscription ───────────────────────────
  function listenSession(id) {
    cleanup();
    sessionId.value = id;
    loading.value = true;
    unsubscribe = onSnapshot(
      doc(db, 'sessions', id),
      (snap) => {
        loading.value = false;
        if (snap.exists()) {
          session.value = { id: snap.id, ...snap.data() };
          error.value = null;
        } else {
          session.value = null;
          error.value = 'Session not found';
        }
      },
      (err) => {
        loading.value = false;
        error.value = err.message;
      },
    );
  }

  /** Subscribe to the sessions this user hosts (for the "my events" list). */
  function listenMySessions(callback) {
    const u = authStore.user;
    if (!u) return () => {};
    const q = query(collection(db, 'sessions'), where('hostUid', '==', u.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.dateTimeMs || 0) - (a.dateTimeMs || 0));
      callback(list);
    });
  }

  async function getSession(id) {
    const snap = await getDoc(doc(db, 'sessions', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  // ── RSVP (atomic cap enforcement) ───────────────────
  async function rsvp(id) {
    const u = requireUser();
    await runTransaction(db, async (t) => {
      const ref_ = doc(db, 'sessions', id);
      const snap = await t.get(ref_);
      if (!snap.exists()) throw new Error('Session not found');
      const s = snap.data();
      if (s.status !== 'scheduling') throw new Error('報名已截止');
      const uids = Array.isArray(s.rosterUids) ? s.rosterUids : [];
      if (uids.includes(u.uid)) return; // already in — idempotent
      const roster = Array.isArray(s.roster) ? s.roster : [];
      const max = Number(s.maxPlayers) || 0;
      if (max > 0 && roster.length >= max) throw new Error('已滿座');
      t.update(ref_, {
        roster: [...roster, rosterEntry(u)],
        rosterUids: [...uids, u.uid],
        updatedAt: serverTimestamp(),
      });
    });
  }

  async function cancelRsvp(id) {
    const u = requireUser();
    await runTransaction(db, async (t) => {
      const ref_ = doc(db, 'sessions', id);
      const snap = await t.get(ref_);
      if (!snap.exists()) throw new Error('Session not found');
      const s = snap.data();
      if (s.status !== 'scheduling') throw new Error('報名已截止');
      const roster = (s.roster || []).filter((r) => r && r.uid !== u.uid);
      const uids = (s.rosterUids || []).filter((x) => x !== u.uid);
      t.update(ref_, { roster, rosterUids: uids, updatedAt: serverTimestamp() });
    });
  }

  // ── Table activation (lazy create) ──────────────────
  /**
   * Create the real room for a queue entry, reusing existing create APIs.
   * @return {{gameId: ?string, tournamentSessionId: ?string}}
   */
  async function createTableRoom(sessionDoc, entry) {
    const snapshot = entry.presetSnapshot || {};
    const buyIn = Number(snapshot.buyIn) || 0;
    const name = snapshot.name || entry.label || sessionDoc.name || 'Table';

    if (entry.kind === 'tournament') {
      const tournamentSessionId = await clock.createSession({
        name,
        subtitle: snapshot.subtitle || '',
        buyIn,
        startingChips: snapshot.startingChips,
        reentryUntilLevel: snapshot.reentryUntilLevel,
        maxReentries: snapshot.maxReentries,
        levels: snapshot.levels,
        payoutRatios: snapshot.payoutRatios,
      });
      const gameId = await gameStore.createGame(name, buyIn, GAME_TYPE.TOURNAMENT, { tournamentSessionId });
      if (gameId) {
        await updateDoc(doc(db, 'tournamentSessions', tournamentSessionId), { gameId });
      }
      return { gameId, tournamentSessionId };
    }

    // cash
    const gameId = await gameStore.createGame(name, buyIn, GAME_TYPE.LIVE, { rate: snapshot.rate });
    return { gameId, tournamentSessionId: null };
  }

  async function activateIndex(id, index) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const s = snap.data();
    const queue = s.tableQueue || [];
    const entry = queue[index];
    if (!entry) throw new Error('No table at this position');

    const { gameId, tournamentSessionId } = await createTableRoom(s, entry);

    const newQueue = queue.map((e, i) => {
      if (i < index) return { ...e, status: 'done' };
      if (i === index) return { ...e, status: 'active', gameId, tournamentSessionId };
      return e;
    });

    await updateDoc(ref_, {
      status: 'active',
      currentTableIndex: index,
      activeTable: { kind: entry.kind, gameId, tournamentSessionId },
      tableQueue: newQueue,
      updatedAt: serverTimestamp(),
    });
    return { gameId, tournamentSessionId, kind: entry.kind };
  }

  /** Host: "轉為正式開局" — activate the first queued table. */
  function activateFirstTable(id) {
    return activateIndex(id, 0);
  }

  /** Host: "進入下一場次" — close the current table and activate the next. */
  async function advanceToNextTable(id) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const s = snap.data();
    const queue = s.tableQueue || [];
    const cur = s.currentTableIndex ?? -1;
    const next = cur + 1;

    if (next >= queue.length) {
      const newQueue = queue.map((e, i) => (i === cur ? { ...e, status: 'done' } : e));
      await updateDoc(ref_, {
        status: 'completed',
        tableQueue: newQueue,
        activeTable: null,
        updatedAt: serverTimestamp(),
      });
      return { completed: true };
    }
    return activateIndex(id, next);
  }

  /** Host: end the whole event now. */
  async function endSession(id) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const queue = (snap.data().tableQueue || []).map((e) => (
      e.status === 'active' ? { ...e, status: 'done' } : e
    ));
    await updateDoc(ref_, {
      status: 'completed',
      tableQueue: queue,
      activeTable: null,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Session summary ─────────────────────────────────
  /** Read every activated table's game doc and roll them up (see sessionFlow). */
  async function loadSessionSummary(id) {
    const s = await getSession(id);
    if (!s) return aggregateSessionSummary([]);
    const entries = (s.tableQueue || []).filter((e) => e.gameId);
    const games = await Promise.all(entries.map(async (e) => {
      const snap = await getDoc(doc(db, 'games', e.gameId));
      if (!snap.exists()) return null;
      const g = snap.data();
      return {
        name: e.label || g.name || '',
        kind: e.kind,
        rate: g.rate || 1,
        settlementSnapshot: g.settlementSnapshot,
      };
    }));
    return aggregateSessionSummary(games.filter(Boolean));
  }

  // ── Cleanup ─────────────────────────────────────────
  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
  onUnmounted(cleanup);

  return {
    session,
    sessionId,
    loading,
    error,
    isHost,
    createSession,
    updateSession,
    updateQueue,
    listenSession,
    listenMySessions,
    getSession,
    rsvp,
    cancelRsvp,
    activateFirstTable,
    advanceToNextTable,
    endSession,
    loadSessionSummary,
    cleanup,
  };
}
