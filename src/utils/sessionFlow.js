/**
 * Session flow helpers
 * Pure decision & aggregation logic for the live-event (Session) layer: routing
 * a visitor to the right view, RSVP cap checks, building the redirect target for
 * the active table, location-privacy gating, and rolling up a whole session's
 * tables into one summary.
 *
 * Kept free of Vue/Firebase (mirrors src/utils/pokerEntry.js) so the rules can
 * be unit-tested directly; the components/composables just act on what these
 * return.
 */

// ── Membership & role ────────────────────────────────────────────────

/** Is this uid on the RSVP roster? Prefers the denormalised rosterUids list. */
export function isRosterMember(session, uid) {
  if (!session || !uid) return false;
  if (Array.isArray(session.rosterUids)) return session.rosterUids.includes(uid);
  return Array.isArray(session.roster) && session.roster.some((r) => r && r.uid === uid);
}

/** Is this uid the host (organiser) of the session? */
export function isHost(session, uid) {
  return !!session && !!uid && session.hostUid === uid;
}

// ── RSVP capacity ────────────────────────────────────────────────────

/** Current number of people on the roster. */
export function rosterCount(session) {
  if (!session) return 0;
  if (Array.isArray(session.roster)) return session.roster.length;
  if (Array.isArray(session.rosterUids)) return session.rosterUids.length;
  return 0;
}

/** Has the roster reached maxPlayers? (maxPlayers <= 0 means uncapped.) */
export function isFull(session) {
  const max = Number(session?.maxPlayers) || 0;
  if (max <= 0) return false;
  return rosterCount(session) >= max;
}

/**
 * Can this uid still reserve a spot? Only while scheduling, not already on the
 * roster, and not full. (The actual write is guarded again by a transaction.)
 */
export function canJoinRsvp(session, uid) {
  if (!session || !uid) return false;
  if (session.status !== 'scheduling') return false;
  if (isRosterMember(session, uid)) return false;
  return !isFull(session);
}

// ── Active table → route ─────────────────────────────────────────────

/**
 * Build the redirect path for the currently active table. Both live cash and
 * tournament tables route to their player-facing table view by gameId — cash to
 * the ledger (/game/:id), tournaments to the table manager
 * (/tournament-game/:id), NOT the clock. Returns null when nothing is activated.
 */
export function buildActiveRoute(activeTable) {
  if (!activeTable || !activeTable.gameId) return null;
  if (activeTable.kind === 'tournament') {
    return `/tournament-game/${activeTable.gameId}`;
  }
  return `/game/${activeTable.gameId}`;
}

/** The roster entry for this uid, or null. */
export function rosterEntryOf(session, uid) {
  if (!session || !uid) return null;
  return (session.roster || []).find((r) => r && r.uid === uid) || null;
}

/**
 * Is this uid signed up for a specific table? A roster entry with no `tableIds`
 * (legacy data, or "all tables") counts as signed up for every table.
 */
export function isSignedUpForTable(session, uid, tableId) {
  const e = rosterEntryOf(session, uid);
  if (!e) return false;
  if (!Array.isArray(e.tableIds)) return true;
  return e.tableIds.includes(tableId);
}

// ── View routing decision ────────────────────────────────────────────

/**
 * Decide what the SessionView should show for this visitor.
 *   mode 'rsvp'         → scheduling, non-host → show reservation UI
 *   mode 'host-console' → host (any non-completed status) → management console
 *   mode 'redirect'     → active, member signed up for the active table → jump in
 *   mode 'event'        → active, member NOT in the active table → show event page
 *   mode 'blocked'      → active, not on roster → "you haven't signed up" wall
 *   mode 'completed'    → finished → show the session summary
 *
 * @param {Object} session - sessions/{id} document
 * @param {string} uid - the local user's uid
 * @return {{mode: string, route?: string}}
 */
export function resolveSessionView(session, uid) {
  if (!session) return { mode: 'completed' };

  const host = isHost(session, uid);

  switch (session.status) {
  case 'scheduling':
    return host ? { mode: 'host-console' } : { mode: 'rsvp' };
  case 'active': {
    const route = buildActiveRoute(session.activeTable);
    // Host stays on the console to manage tables (and can tap into the table
    // from there); they are never force-redirected.
    if (host) return { mode: 'host-console', route };
    if (!isRosterMember(session, uid)) return { mode: 'blocked' };
    // A roster member is sent in only for tables they signed up for; otherwise
    // they see the event page and wait for their table.
    if (route && isSignedUpForTable(session, uid, session.activeTable?.id)) {
      return { mode: 'redirect', route };
    }
    return { mode: 'event' };
  }
  case 'completed':
    return { mode: 'completed' };
  default:
    return { mode: 'completed' };
  }
}

// ── Location privacy ─────────────────────────────────────────────────

/**
 * Should the venue name be shown to this visitor? Public unless the host marked
 * it "joined only", in which case only the host and roster members see it.
 * UI-level gating (the field still lives in the publicly-readable doc) — fine
 * for a coarse venue label, per spec intent.
 */
export function canViewLocation(session, uid) {
  const loc = session?.location;
  if (!loc || !loc.name) return false;
  if (!loc.showToJoinedOnly) return true;
  return isHost(session, uid) || isRosterMember(session, uid);
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
