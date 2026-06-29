/**
 * Sessions Composable (v2 — period model)
 * Manages the live-event (Session) layer via Firestore real-time sync, mirroring
 * the client-direct pattern used by the cash ledger (`games`) and tournament
 * clock (`tournamentSessions`).
 *
 * A Session holds an ordered list of "periods" (時段). Each period has its own
 * free-text label, a type (cash / tournament / custom), its own maxPlayers, and
 * its own RSVP roster. Cash/tournament periods link to a real table (created
 * lazily and auto-seated with that period's sign-ups); custom periods have no
 * table — the auto-advance chain pauses on them until the host moves on.
 *
 * No Cloud Functions: per-period RSVP caps are enforced atomically with
 * runTransaction; `participantUids` (union of all period rosters) powers the
 * lobby "events I joined" query and the rules membership check.
 */

import { ref, computed, onUnmounted } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, runTransaction, query, where,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import { useGameStore } from '../store/modules/game.js';
import { useTournamentClock } from './useTournamentClock.js';
import { GAME_TYPE } from '../utils/constants.js';
import { defaultSessionName, aggregateSessionSummary } from '../utils/sessionFlow.js';

// Live/scheduling events float to the top of the "my events" list; finished
// ones sink. Within a status group, newest first.
const STATUS_RANK = { active: 0, scheduling: 1, completed: 2 };
export const MY_SESSIONS_LIMIT = 20;

/** Sort a session list for the lobby (status priority, then newest first). */
export function sortSessions(list) {
  return [...list].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 3;
    const rb = STATUS_RANK[b.status] ?? 3;
    if (ra !== rb) return ra - rb;
    return (b.dateTimeMs || 0) - (a.dateTimeMs || 0);
  });
}

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
    return { uid: u.uid, name: authStore.displayName, avatar: u.photoURL || null, joinedAtMs: Date.now() };
  }

  /** Stable period id (survives reordering; RSVP selections key off it). */
  function genPeriodId(i) {
    return `p_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Normalise an editor period list into stored period rows. */
  function buildPeriods(raw = []) {
    return raw.map((e, i) => {
      const type = ['cash', 'tournament', 'custom'].includes(e.type) ? e.type : 'cash';
      return {
        id: e.id || genPeriodId(i),
        order: i,
        label: e.label || '',
        type,
        maxPlayers: Number(e.maxPlayers) > 0 ? Number(e.maxPlayers) : 8,
        presetSnapshot: type === 'custom' ? {} : (e.presetSnapshot || {}),
        roster: Array.isArray(e.roster) ? e.roster : [],
        rosterUids: Array.isArray(e.rosterUids) ? e.rosterUids : [],
        gameId: e.gameId || null,
        tournamentSessionId: e.tournamentSessionId || null,
        status: e.status || 'queued',
      };
    });
  }

  /** Union of every period's rosterUids. */
  function unionParticipants(periods) {
    const set = new Set();
    for (const p of periods || []) for (const uid of p.rosterUids || []) set.add(uid);
    return [...set];
  }

  // ── Create / edit ───────────────────────────────────
  async function createSession(form) {
    const u = requireUser();
    loading.value = true;
    error.value = null;
    try {
      const ref_ = doc(collection(db, 'sessions'));
      // The host opens the room to play: seat them in every period by default so
      // a fresh event reads "1/N" rather than an empty "0/N". They can still
      // drop out of any period from the host console's sign-up picker.
      const hostEntry = rosterEntry(u);
      const periods = buildPeriods(form.periods).map((p) => {
        const max = Number(p.maxPlayers) || 0;
        if ((p.rosterUids || []).includes(u.uid)) return p;
        if (max > 0 && (p.roster || []).length >= max) return p;
        return {
          ...p,
          roster: [...(p.roster || []), hostEntry],
          rosterUids: [...(p.rosterUids || []), u.uid],
        };
      });
      await setDoc(ref_, {
        name: form.name || defaultSessionName(Date.now()),
        hostUid: u.uid,
        hostName: authStore.displayName,
        dateTimeMs: Number(form.dateTimeMs) || Date.now(),
        location: { name: form.location?.name || '' },
        status: 'scheduling',
        periods,
        participantUids: unionParticipants(periods),
        currentSlotIndex: -1,
        activeSlot: null,
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

  /**
   * Host-only edit. When `periods` is provided, live state (roster, status,
   * linkage) of existing periods is preserved by id so editing labels/types/caps
   * never wipes sign-ups or running tables.
   */
  async function updateSession(id, patch) {
    const ref_ = doc(db, 'sessions', id);
    const data = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.dateTimeMs !== undefined) data.dateTimeMs = Number(patch.dateTimeMs) || Date.now();
    if (patch.location !== undefined) data.location = { name: patch.location?.name || '' };
    if (patch.periods !== undefined) {
      const cur = await getDoc(ref_);
      const existing = cur.exists() ? (cur.data().periods || []) : [];
      const byId = new Map(existing.map((p) => [p.id, p]));
      const merged = buildPeriods(patch.periods).map((p) => {
        const old = byId.get(p.id);
        if (!old) return p;
        return {
          ...p,
          roster: old.roster || [],
          rosterUids: old.rosterUids || [],
          status: old.status || 'queued',
          gameId: old.gameId || null,
          tournamentSessionId: old.tournamentSessionId || null,
        };
      });
      data.periods = merged;
      data.participantUids = unionParticipants(merged);
    }
    await updateDoc(ref_, data);
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
      (err) => { loading.value = false; error.value = err.message; },
    );
  }

  /** Sessions this user hosts (raw, unsorted). */
  function listenMySessions(callback) {
    const u = authStore.user;
    if (!u) return () => {};
    const q = query(collection(db, 'sessions'), where('hostUid', '==', u.uid));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }

  /** Sessions this user has RSVP'd to any period of (raw, unsorted). */
  function listenJoinedSessions(callback) {
    const u = authStore.user;
    if (!u) return () => {};
    const q = query(collection(db, 'sessions'), where('participantUids', 'array-contains', u.uid));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }

  /** A table's game status (for host-side auto-advance). */
  function listenGameStatus(gameId, callback) {
    if (!gameId) return () => {};
    return onSnapshot(doc(db, 'games', gameId), (snap) => {
      callback(snap.exists() ? (snap.data().status || null) : 'missing');
    });
  }

  /** Is there a period after the current one? */
  function hasNextSlot(s) {
    const periods = s?.periods || [];
    return ((s?.currentSlotIndex ?? -1) + 1) < periods.length;
  }

  async function getSession(id) {
    const snap = await getDoc(doc(db, 'sessions', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  // ── RSVP (per-period, atomic cap) ───────────────────
  /**
   * Set this user's sign-ups to exactly `periodIds`. Adds to newly-selected
   * queued periods (capacity-checked), removes from deselected queued periods.
   * Active/done periods are immutable.
   *
   * Idempotent: if the requested set matches the current sign-up exactly, no
   * write is made and `{ changed: false }` is returned, so the caller can skip
   * re-posting the roster card (prevents spam from repeated taps). Otherwise
   * returns the updated session with `changed: true`.
   */
  async function rsvp(id, periodIds = []) {
    const u = requireUser();
    const want = new Set(periodIds || []);
    return runTransaction(db, async (t) => {
      const ref_ = doc(db, 'sessions', id);
      const snap = await t.get(ref_);
      if (!snap.exists()) throw new Error('Session not found');
      const s = snap.data();
      const periods = Array.isArray(s.periods) ? s.periods : [];
      const entry = rosterEntry(u);

      let changed = false;
      const next = periods.map((p) => {
        const locked = p.status && p.status !== 'queued';
        if (locked) return p;
        const inIt = (p.rosterUids || []).includes(u.uid);
        const desired = want.has(p.id);
        if (desired && !inIt) {
          const max = Number(p.maxPlayers) || 0;
          if (max > 0 && (p.roster || []).length >= max) {
            throw new Error(`「${p.label || ''}」已滿座`);
          }
          changed = true;
          return { ...p, roster: [...(p.roster || []), entry], rosterUids: [...(p.rosterUids || []), u.uid] };
        }
        if (!desired && inIt) {
          changed = true;
          return {
            ...p,
            roster: (p.roster || []).filter((r) => r.uid !== u.uid),
            rosterUids: (p.rosterUids || []).filter((x) => x !== u.uid),
          };
        }
        return p;
      });

      if (!changed) return { id, ...s, changed: false };
      const participantUids = unionParticipants(next);
      t.update(ref_, { periods: next, participantUids, updatedAt: serverTimestamp() });
      return { id, ...s, periods: next, participantUids, changed: true };
    });
  }

  /**
   * Leave the event: remove this user from all queued periods. Idempotent —
   * returns `{ changed: false }` (no write) when the user wasn't signed up for
   * any queued period.
   */
  async function cancelRsvp(id) {
    const u = requireUser();
    return runTransaction(db, async (t) => {
      const ref_ = doc(db, 'sessions', id);
      const snap = await t.get(ref_);
      if (!snap.exists()) throw new Error('Session not found');
      const s = snap.data();
      const periods = Array.isArray(s.periods) ? s.periods : [];
      let changed = false;
      const next = periods.map((p) => {
        const locked = p.status && p.status !== 'queued';
        if (locked || !(p.rosterUids || []).includes(u.uid)) return p;
        changed = true;
        return {
          ...p,
          roster: (p.roster || []).filter((r) => r.uid !== u.uid),
          rosterUids: (p.rosterUids || []).filter((x) => x !== u.uid),
        };
      });
      if (!changed) return { id, ...s, changed: false };
      const participantUids = unionParticipants(next);
      t.update(ref_, { periods: next, participantUids, updatedAt: serverTimestamp() });
      return { id, ...s, periods: next, participantUids, changed: true };
    });
  }

  // ── Period activation (lazy create for linked periods) ──
  async function createTableRoom(sessionDoc, period) {
    const snapshot = period.presetSnapshot || {};
    const buyIn = Number(snapshot.buyIn) || 0;
    const name = snapshot.name || period.label || sessionDoc.name || 'Table';

    if (period.type === 'tournament') {
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
      if (gameId) await updateDoc(doc(db, 'tournamentSessions', tournamentSessionId), { gameId });
      return { gameId, tournamentSessionId };
    }
    const gameId = await gameStore.createGame(name, buyIn, GAME_TYPE.LIVE, { rate: snapshot.rate });
    return { gameId, tournamentSessionId: null };
  }

  /** Seat everyone signed up for this period (host is already seated; dedup by uid). */
  async function addSignedUpPlayers(gameId, period, buyIn) {
    if (!gameId) return;
    const wanted = (period.roster || []).filter((r) => r && r.uid);
    if (!wanted.length) return;
    const gameRef = doc(db, 'games', gameId);
    const gSnap = await getDoc(gameRef);
    if (!gSnap.exists()) return;
    const players = Array.isArray(gSnap.data().players) ? gSnap.data().players.slice() : [];
    const seen = new Set(players.map((p) => p.uid).filter(Boolean));
    let added = 0;
    for (const r of wanted) {
      if (seen.has(r.uid)) continue;
      seen.add(r.uid);
      players.push({ id: `${Date.now()}_${added}`, name: r.name || 'Player', uid: r.uid, buyIn: Number(buyIn) || 0, stack: 0 });
      added += 1;
    }
    if (added > 0) await updateDoc(gameRef, { players });
  }

  /**
   * Activate the period at `index`. Linked (cash/tournament) periods create the
   * table and auto-seat sign-ups; custom periods just become the active slot
   * with no table (the chain pauses there). Earlier periods are marked done.
   */
  async function activateIndex(id, index) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const s = snap.data();
    const periods = s.periods || [];
    const period = periods[index];
    if (!period) throw new Error('No period at this position');

    let gameId = null;
    let tournamentSessionId = null;
    if (period.type !== 'custom') {
      ({ gameId, tournamentSessionId } = await createTableRoom(s, period));
      await addSignedUpPlayers(gameId, period, Number(period.presetSnapshot?.buyIn) || 0);
    }

    const newPeriods = periods.map((e, i) => {
      if (i < index) return e.status === 'done' ? e : { ...e, status: 'done' };
      if (i === index) return { ...e, status: 'active', gameId, tournamentSessionId };
      return e;
    });
    const activeSlot = period.type === 'custom'
      ? { id: period.id, type: 'custom' }
      : { id: period.id, type: period.type, gameId, tournamentSessionId };

    await updateDoc(ref_, {
      status: 'active',
      currentSlotIndex: index,
      activeSlot,
      periods: newPeriods,
      updatedAt: serverTimestamp(),
    });
    return { gameId, tournamentSessionId, type: period.type };
  }

  /** Host: "轉為正式開局" — activate the first period. */
  function activateFirstTable(id) {
    return activateIndex(id, 0);
  }

  /**
   * Advance to the next period: mark the current one done and activate the next
   * (creating its table, or pausing if it's custom). If none remain, clear the
   * active slot but keep the event 'active' (host ends manually). Used by both
   * the host-side auto-advance and the manual "start next period" action.
   */
  async function advanceToNextTable(id) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const s = snap.data();
    const periods = s.periods || [];
    const cur = s.currentSlotIndex ?? -1;
    const next = cur + 1;
    if (next >= periods.length) {
      const newPeriods = periods.map((e, i) => (i === cur && e.status !== 'done' ? { ...e, status: 'done' } : e));
      await updateDoc(ref_, { periods: newPeriods, activeSlot: null, updatedAt: serverTimestamp() });
      return { activeSlot: null };
    }
    return activateIndex(id, next);
  }

  /** Host: delete the whole event (underlying table games keep their history). */
  async function deleteSession(id) {
    await deleteDoc(doc(db, 'sessions', id));
  }

  /** Host: end the whole event now. */
  async function endSession(id) {
    const ref_ = doc(db, 'sessions', id);
    const snap = await getDoc(ref_);
    if (!snap.exists()) throw new Error('Session not found');
    const periods = (snap.data().periods || []).map((e) => (e.status === 'active' ? { ...e, status: 'done' } : e));
    await updateDoc(ref_, { status: 'completed', periods, activeSlot: null, updatedAt: serverTimestamp() });
  }

  // ── Session summary ─────────────────────────────────
  async function loadSessionSummary(id) {
    const s = await getSession(id);
    if (!s) return aggregateSessionSummary([]);
    const linked = (s.periods || []).filter((e) => e.gameId);
    const games = await Promise.all(linked.map(async (e) => {
      const snap = await getDoc(doc(db, 'games', e.gameId));
      if (!snap.exists()) return null;
      const g = snap.data();
      return { name: e.label || g.name || '', kind: e.type, rate: g.rate || 1, settlementSnapshot: g.settlementSnapshot };
    }));
    return aggregateSessionSummary(games.filter(Boolean));
  }

  // ── Personal quick-setup ("the usual" event, one per user) ──
  // Stored on the user doc so a host can recreate their regular venue + period
  // layout with one tap. Only the reusable shape is kept — never the date,
  // rosters, statuses, or table linkage. Guarded by the users/{uid} owner rule.
  async function getSessionQuickSetup() {
    const u = authStore.user;
    if (!u) return null;
    const snap = await getDoc(doc(db, 'users', u.uid));
    return snap.exists() ? (snap.data().sessionQuickSetup || null) : null;
  }

  async function saveSessionQuickSetup(setup) {
    const u = requireUser();
    await setDoc(
      doc(db, 'users', u.uid),
      { sessionQuickSetup: { ...setup, updatedAt: serverTimestamp() } },
      { merge: true },
    );
  }

  // ── Cleanup ─────────────────────────────────────────
  function cleanup() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
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
    listenSession,
    listenMySessions,
    listenJoinedSessions,
    listenGameStatus,
    hasNextSlot,
    getSession,
    rsvp,
    cancelRsvp,
    activateFirstTable,
    advanceToNextTable,
    endSession,
    deleteSession,
    loadSessionSummary,
    getSessionQuickSetup,
    saveSessionQuickSetup,
    cleanup,
  };
}
