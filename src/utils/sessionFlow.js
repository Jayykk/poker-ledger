/**
 * Session flow helpers
 * Pure decision & aggregation logic for the live-event (Session) layer, now
 * organised around ordered "periods" (時段): routing a visitor to the right
 * view, per-period RSVP capacity checks, building the redirect target for the
 * active period's table, and rolling a session's tables into one summary.
 *
 * Kept free of Vue/Firebase (mirrors src/utils/pokerEntry.js) so the rules can
 * be unit-tested directly; the components/composables just act on what these
 * return.
 */

// ── Role ─────────────────────────────────────────────────────────────

/** Is this uid the host (organiser) of the session? */
export function isHost(session, uid) {
  return !!session && !!uid && session.hostUid === uid;
}

// ── Periods ──────────────────────────────────────────────────────────

/** Find a period by id, or null. */
export function periodById(session, periodId) {
  if (!session || !periodId) return null;
  return (session.periods || []).find((p) => p && p.id === periodId) || null;
}

/** The uids signed up for a period (prefers the denormalised rosterUids). */
export function periodRosterUids(period) {
  if (!period) return [];
  if (Array.isArray(period.rosterUids)) return period.rosterUids;
  return (period.roster || []).map((r) => r && r.uid).filter(Boolean);
}

/** Number signed up for a period. */
export function periodCount(period) {
  if (!period) return 0;
  if (Array.isArray(period.roster)) return period.roster.length;
  return periodRosterUids(period).length;
}

/** Has a period hit its own maxPlayers? (<= 0 means uncapped.) */
export function periodFull(period) {
  const max = Number(period?.maxPlayers) || 0;
  if (max <= 0) return false;
  return periodCount(period) >= max;
}

/** A period is locked for sign-up changes once it is active or done. */
export function isPeriodLocked(period) {
  return !!period && !!period.status && period.status !== 'queued';
}

/**
 * Can this uid still toggle their sign-up for a period? Only while the period is
 * queued, and either they're already in it (so they can leave) or it isn't full.
 */
export function canJoinPeriod(period, uid) {
  if (!period || !uid) return false;
  if (isPeriodLocked(period)) return false;
  if (periodRosterUids(period).includes(uid)) return true;
  return !periodFull(period);
}

/** Is this uid signed up for a specific period? */
export function isSignedUpForPeriod(session, uid, periodId) {
  if (!uid) return false;
  return periodRosterUids(periodById(session, periodId)).includes(uid);
}

/** Is this uid signed up for ANY period (i.e. a participant of the event)? */
export function isParticipant(session, uid) {
  if (!session || !uid) return false;
  if (Array.isArray(session.participantUids)) return session.participantUids.includes(uid);
  return (session.periods || []).some((p) => periodRosterUids(p).includes(uid));
}

// ── Active period → route ────────────────────────────────────────────

/**
 * Build the redirect path for the active period's table. Linked periods route
 * to their player-facing table by gameId — cash to the ledger (/game/:id),
 * tournaments to the table manager (/tournament-game/:id), NOT the clock.
 * Returns null for custom periods (no gameId) or when nothing is active.
 */
export function buildActiveRoute(activeSlot) {
  if (!activeSlot || !activeSlot.gameId) return null;
  const t = activeSlot.type || activeSlot.kind;
  if (t === 'tournament') return `/tournament-game/${activeSlot.gameId}`;
  return `/game/${activeSlot.gameId}`;
}

// ── View routing decision ────────────────────────────────────────────

/**
 * Decide what the SessionView should show for this visitor.
 *   mode 'completed'    → finished → show the session summary
 *   mode 'host-console' → host (any non-completed status) → management console
 *   mode 'redirect'     → active, member signed up for the active linked period → jump in
 *   mode 'rsvp'         → everyone else → the period sign-up board
 *
 * @param {Object} session - sessions/{id} document
 * @param {string} uid - the local user's uid
 * @return {{mode: string, route?: string}}
 */
export function resolveSessionView(session, uid) {
  if (!session) return { mode: 'completed' };
  if (session.status === 'completed') return { mode: 'completed' };

  if (isHost(session, uid)) {
    return { mode: 'host-console', route: buildActiveRoute(session.activeSlot) };
  }

  if (session.status === 'active') {
    const route = buildActiveRoute(session.activeSlot);
    const activeId = session.activeSlot?.id;
    if (route && activeId && isSignedUpForPeriod(session, uid, activeId)) {
      return { mode: 'redirect', route };
    }
  }
  // Scheduling, or active-but-not-in-the-running-table: the sign-up board.
  return { mode: 'rsvp' };
}

// ── Location ─────────────────────────────────────────────────────────

/** Is there a venue name to show? (Location is always public.) */
export function canViewLocation(session) {
  return !!session?.location?.name;
}

// ── Defaults ─────────────────────────────────────────────────────────

/**
 * Default session name: "YYYYMMDD 德州撲克活動", derived from the given time so
 * the function stays pure/testable (caller passes Date.now()).
 */
export function defaultSessionName(dateMs) {
  const d = new Date(typeof dateMs === 'number' ? dateMs : Date.parse(dateMs));
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day} 德州撲克活動`;
}

// ── Session summary aggregation ──────────────────────────────────────

/**
 * Roll a session's finished tables into one summary, mirroring the cash-value
 * aggregation in useDailyReport (profit/buy-in divided by each table's rate,
 * player ranking keyed by odId with a name fallback).
 *
 * @param {Array<{name?, kind?, rate?, settlement?, settlementSnapshot?}>} tableGames
 *   Each table's game doc; settlement rows are { odId, name, buyIn, stack, profit }.
 * @return {{tables, ranking, tableCount, totalBuyIn, topWinners, topLosers}}
 */
export function aggregateSessionSummary(tableGames = []) {
  const map = new Map(); // key: odId|name → aggregated player row
  let totalBuyIn = 0;
  let tableCount = 0;
  const tables = [];

  for (const g of tableGames) {
    if (!g) continue;
    const rows = g.settlement || g.settlementSnapshot;
    if (!Array.isArray(rows)) continue;
    tableCount += 1;
    const rate = Number(g.rate) || 1;
    let tableBuyIn = 0;

    for (const p of rows) {
      const key = p.odId || p.name;
      if (!key) continue;
      const cashProfit = (Number(p.profit) || 0) / rate;
      const cashBuyIn = (Number(p.buyIn) || 0) / rate;
      tableBuyIn += cashBuyIn;

      const existing = map.get(key);
      if (existing) {
        existing.profitCash += cashProfit;
        existing.buyInCash += cashBuyIn;
        existing.tables += 1;
        if (p.odId && !existing.odId) existing.odId = p.odId;
      } else {
        map.set(key, {
          odId: p.odId || null,
          name: p.name,
          profitCash: cashProfit,
          buyInCash: cashBuyIn,
          tables: 1,
        });
      }
    }

    totalBuyIn += tableBuyIn;
    tables.push({
      name: g.name || '',
      kind: g.kind || 'cash',
      buyInCash: tableBuyIn,
      players: rows.length,
    });
  }

  const ranking = [...map.values()].sort((a, b) => b.profitCash - a.profitCash);
  return {
    tables,
    ranking,
    tableCount,
    totalBuyIn,
    topWinners: ranking.filter((p) => p.profitCash > 0).slice(0, 3),
    topLosers: ranking.filter((p) => p.profitCash < 0).slice(-3).reverse(),
  };
}
