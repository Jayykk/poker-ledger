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

  /** Generate a stable table id (survives queue reordering). */
  function genTableId(i) {
    return `t_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Normalise a queue editor list into stored tableQueue rows. */
  function buildQueue(rawQueue = []) {
    return rawQueue.map((e, i) => ({
      id: e.id || genTableId(i),
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

  // Live/scheduling events float to the top of the "my events" list; finished
  // ones sink. Within a status group, newest first. Capped to avoid clutter.
  const STATUS_RANK = { active: 0, scheduling: 1, completed: 2 };
  const MY_SESSIONS_LIMIT = 20;

  /** Subscribe to the sessions this user hosts (for the "my events" list). */
  function listenMySessions(callback) {
    const u = authStore.user;
    if (!u) return () => {};
    const q = query(collection(db, 'sessions'), where('hostUid', '==', u.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ra = STATUS_RANK[a.status] ?? 3;
        const rb = STATUS_RANK[b.status] ?? 3;
        if (ra !== rb) return ra - rb;
        return (b.dateTimeMs || 0) - (a.dateTimeMs || 0);
      });
      callback(list.slice(0, MY_SESSIONS_LIMIT));
    });
  }

  /** Subscribe to a table's game status (for host-side auto-advance). */
  function listenGameStatus(gameId, callback) {
    if (!gameId) return () => {};
    return onSnapshot(doc(db, 'games', gameId), (snap) => {
      callback(snap.exists() ? (snap.data().status || null) : 'missing');
    });
  }

  /** Is there a queued table after the current one? */
  function hasNextTable(s) {
    const queue = s?.tableQueue || [];
    const next = (s?.currentTableIndex ?? -1) + 1;
    return next < queue.length;
  }

  async function getSession(id) {
    const snap = await getDoc(doc(db, 'sessions', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  // ── RSVP (atomic cap enforcement) ───────────────────
  /**
   * Sign up (or update table selection). `tableIds` is the list of tables the
   * player will join; omit/empty means "all tables". Idempotent on re-RSVP:
   * an existing member's selection is updated without consuming another slot.
   */
  async function rsvp(id, tableIds = null) {
    const u = requireUser();
    await runTransaction(db, async (t) => {
      const ref_ = doc(db, 'sessions', id);
      const snap = await t.get(ref_);
      if (!snap.exists()) throw new Error('Session not found');
      const s = snap.data();
      if (s.status !== 'scheduling') throw new Error('報名已截止');
      const roster = Array.isArray(s.roster) ? s.roster : [];
      const uids = Array.isArray(s.rosterUids) ? s.rosterUids : [];
      const entry = { ...rosterEntry(u) };
      if (Array.isArray(tableIds)) entry.tableIds = tableIds;

      const existingIdx = roster.findIndex((r) => r && r.uid === u.uid);
      if (existingIdx >= 0) {
        // Update selection in place; keep original joinedAtMs.
        const next = roster.slice();
        next[existingIdx] = { ...next[existingIdx], tableIds: entry.tableIds };
        t.update(ref_, { roster: next, updatedAt: serverTimestamp() });
        return;
      }
      const max = Number(s.maxPlayers) || 0;
      if (max > 0 && roster.length >= max) throw new Error('已滿座');
      t.update(ref_, {
        roster: [...roster, entry],
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

  /**
   * Add the roster members who signed up for this table as players of the freshly
   * created game (the host is already seated by createGame). A member with no
   * `tableIds` counts as signed up for every table.
   */
  async function addSignedUpPlayers(gameId, sessionDoc, entry, buyIn) {
    if (!gameId) return;
    const hostUid = sessionDoc.hostUid;
    const wanted = (sessionDoc.roster || []).filter((r) => {
      if (!r || !r.uid || r.uid === hostUid) return false;
      if (!Array.isArray(r.tableIds)) return true; // "all tables"
      return r.tableIds.includes(entry.id);
    });
    if (wanted.length === 0) return;

    const gameRef = doc(db, 'games', gameId);
    const gSnap = await getDoc(gameRef);
    if (!gSnap.exists()) return;
    const players = Array.isArray(gSnap.data().players) ? gSnap.data().players.slice() : [];
    const seen = new Set(players.map((p) => p.uid).filter(Boolean));

    let added = 0;
    for (const r of wanted) {
      if (seen.has(r.uid)) continue;
      seen.add(r.uid);
      players.push({
        id: `${Date.now()}_${added}`,
        name: r.name || 'Player',
        uid: r.uid,
        buyIn: Number(buyIn) || 0,
        stack: 0,
      });
      added += 1;
    }
    if (added > 0) await updateDoc(gameRef, { players });
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

    // Auto-seat everyone who reserved this specific table.
    const buyIn = Number(entry.presetSnapshot?.buyIn) || 0;
    await addSignedUpPlayers(gameId, s, entry, buyIn);

    const newQueue = queue.map((e, i) => {
      if (i < index) return { ...e, status: 'done' };
      if (i === index) return { ...e, status: 'active', gameId, tournamentSessionId };
      return e;
    });

    await updateDoc(ref_, {
      status: 'active',
      currentTableIndex: index,
      activeTable: { id: entry.id, kind: entry.kind, gameId, tournamentSessionId },
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
    listenGameStatus,
    hasNextTable,
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
