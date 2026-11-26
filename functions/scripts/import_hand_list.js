#!/usr/bin/env node

/**
 * 補登手牌: add hands kept outside the app (a LINE note: date, who, what) to
 * the games they were played in, so the 手牌 titles and 排行榜 › 特殊牌型
 * count them. Each becomes a hand record with the type and a note
 * (games/{gameId}/hands/{importId}); the hands trigger (onGameHandWrite)
 * then recounts the game's hand events, stats and titles. A one-player 四條
 * whose note names the rank (「J鐵」) gets made-up cards: a pocket pair of
 * it, the other two on the board (dealQuads.js). Other hands have no cards.
 *
 * A dry run by default: prints which game and seat every line goes to and
 * what won't go in (no finished game that day, a name not on its roster, a
 * seat without an account, already in that game). --write adds them.
 * Re-running is safe: ids are fixed per line, an imported hand is rewritten
 * in place, never twice.
 *
 * Input (--file): { hands: [{ date: 'YYYY-MM-DD', note?, players: [{ name,
 * handType: 'four_of_a_kind' | 'straight_flush' | 'royal_flush', winner? }] }],
 * aliases?: { 'name in the list': 'name on the roster' } }. A game counts for
 * a date when it started that Taipei day, or finished that day or before 08:00
 * the next. A night with several games: the hand goes to one where every
 * player has a history (so it counts), a tournament when the line says
 * tournament: true, else the one with the most players, else the latest. Any
 * of them is the same night, so the same month for the titles and 排行榜.
 *
 * Usage:
 *   node functions/scripts/import_hand_list.js --file hands.json [--write]
 *
 * Run from an up-to-date main (the trigger that recounts is the deployed one).
 * Credentials: serviceAccountKey.json at repo root / functions, or
 * GOOGLE_APPLICATION_CREDENTIALS. FIRESTORE_DATABASE_ID overrides 'poker-tw'.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { dealQuads } from './dealQuads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const args = process.argv.slice(2);
const write = args.includes('--write');
const fileIndex = args.indexOf('--file');
const file = fileIndex !== -1 ? args[fileIndex + 1] : '';
if (!file || !existsSync(file)) {
  console.error('Give the list: --file hands.json');
  process.exit(1);
}
const input = JSON.parse(readFileSync(file, 'utf8'));
const HAND_TYPES = ['four_of_a_kind', 'straight_flush', 'royal_flush'];

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

const keyPath = [
  join(REPO_ROOT, 'serviceAccountKey.json'),
  join(REPO_ROOT, 'functions', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
].filter(Boolean).find((path) => existsSync(path));
if (keyPath) initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
else initializeApp();

const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');
const millis = (v) => (v?.toMillis ? v.toMillis() : Number(v) || 0);
const TAIPEI = 8 * 3600e3;
const taipeiDay = (ms) => new Date(ms + TAIPEI).toISOString().slice(0, 10);
const taipeiHour = (ms) => new Date(ms + TAIPEI).getUTCHours();
const nextDay = (day) => taipeiDay(Date.parse(`${day}T12:00:00+08:00`) + 86400e3);
const norm = (name) => String(name || '').normalize('NFKC').trim().toLowerCase();
const aliases = Object.fromEntries(Object.entries(input.aliases || {}).map(([k, v]) => [norm(k), norm(v)]));
const rosterName = (name) => aliases[norm(name)] || norm(name);

// Every finished game, with the days it can stand for
const gamesSnap = await db.collection('games').get();
const games = gamesSnap.docs
  .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  .filter((g) => g.status === 'completed')
  .map((g) => {
    const started = millis(g.createdAt);
    const finished = millis(g.completedAt) || millis(g.lastCorrectedAt) || millis(g.updatedAt) || started;
    const days = new Set();
    if (started) days.add(taipeiDay(started));
    if (finished) {
      days.add(taipeiDay(finished));
      if (taipeiHour(finished) < 8) days.add(taipeiDay(finished - 86400e3));
    }
    return { ...g, started, finished, days };
  });

const seatOf = (game, name) => (Array.isArray(game.players) ? game.players : [])
  .find((p) => p && p.id && norm(p.name) === rosterName(name));
const historyCache = new Map();
const hasHistory = async (uid, gameId) => {
  const key = `${uid}/${gameId}`;
  if (!historyCache.has(key)) {
    historyCache.set(key, (await db.collection('users').doc(uid).collection('history_sub').doc(gameId).get()).exists);
  }
  return historyCache.get(key);
};
const handsCache = new Map();
const handsOf = async (gameId) => {
  if (!handsCache.has(gameId)) {
    const snap = await db.collection('games').doc(gameId).collection('hands').get();
    handsCache.set(gameId, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  return handsCache.get(gameId);
};

// The rank a player's four of a kind is in, from the cards ('J'), or null
const quadRank = (hand, hp) => {
  const counts = {};
  for (const card of [...(hp.cards || []), ...(hand.communityCards || [])]) {
    const rank = String(card).slice(0, -1).toUpperCase().replace(/^T$/, '10');
    counts[rank] = (counts[rank] || 0) + 1;
  }
  return Object.keys(counts).find((rank) => counts[rank] >= 4) || null;
};
const usedHands = new Set();
const ready = [];
const problems = [];
for (const [index, line] of (input.hands || []).entries()) {
  const label = `${line.date} ${line.players.map((p) => `${p.name} ${p.handType}`).join(' + ')}${line.note ? ` (${line.note})` : ''}`;
  if (!line.players.every((p) => HAND_TYPES.includes(p.handType))) {
    problems.push(`${label}: unknown hand type`);
    continue;
  }
  const sameDay = games.filter((g) => g.days.has(line.date));
  if (!sameDay.length) {
    const near = games.filter((g) => g.days.has(nextDay(line.date)) || g.days.has(taipeiDay(Date.parse(`${line.date}T12:00:00+08:00`) - 86400e3)));
    problems.push(`${label}: no finished game that day${near.length ? ` (a day off: ${near.map((g) => `${g.id} ${taipeiDay(g.started)}`).join(', ')})` : ''}`);
    continue;
  }
  const withAll = sameDay.filter((g) => line.players.every((p) => seatOf(g, p.name)));
  if (!withAll.length) {
    const names = [...new Set(sameDay.flatMap((g) => (g.players || []).map((p) => p?.name)))];
    const missing = line.players.filter((p) => !sameDay.some((g) => seatOf(g, p.name))).map((p) => p.name);
    problems.push(`${label}: ${missing.join(', ') || 'not all'} not on that night's rosters [${names.join(', ')}]`);
    continue;
  }
  // The night's games, best first (see the header)
  const ranked = [];
  for (const g of withAll) {
    let ok = true;
    for (const p of line.players) {
      const seat = seatOf(g, p.name);
      if (!seat.uid || !(await hasHistory(seat.uid, g.id))) ok = false;
    }
    ranked.push({ g, ok });
  }
  const wantsType = (g) => (g.type === 'tournament') === !!line.tournament;
  ranked.sort((x, y) => (y.ok - x.ok)
    || (wantsType(y.g) - wantsType(x.g))
    || ((y.g.players?.length || 0) - (x.g.players?.length || 0))
    || (y.g.started - x.g.started));
  const game = ranked[0].g;
  const others = withAll.length - 1;
  const seats = line.players.map((p) => ({ ...p, seat: seatOf(game, p.name) }));
  const noAccount = seats.filter((s) => !s.seat.uid);
  const noHistory = [];
  for (const s of seats) {
    if (s.seat.uid && !(await hasHistory(s.seat.uid, game.id))) noHistory.push(s.name);
  }
  // Fixed per line: re-running rewrites the same doc
  const importId = `import-${createHash('sha1').update(`${line.date}|${index}|${label}`).digest('hex').slice(0, 16)}`;
  // Already in the app? A hand recorded that night (any of its games) with
  // every player of the line on the same type; for 四條 the rank in the note
  // (「J鐵」) must agree with the cards when both are known. Each recorded
  // hand stands for one line only.
  const hint = (/(?:^|[^0-9A-Z])(A|K|Q|J|10|[2-9])鐵/.exec(line.note || '') || [])[1] || null;
  const nightHands = (await Promise.all(sameDay.map((g) => handsOf(g.id)))).flat();
  const recorded = nightHands.find((h) => h.id !== importId && !h.importedFrom && !usedHands.has(h.id)
    && h.excludeFromTitles !== true
    && seats.every((s) => (h.players || []).some((hp) => (hp.playerUid ? hp.playerUid === s.seat.uid : norm(hp.playerName) === norm(s.seat.name))
      && hp.handType === s.handType
      && (s.handType !== 'four_of_a_kind' || !hint || !quadRank(h, hp) || quadRank(h, hp) === hint))));
  if (recorded) usedHands.add(recorded.id);
  const notes = [
    ...noAccount.map((s) => `${s.name}: a seat without an account (counts for nobody)`),
    ...noHistory.map((name) => `${name}: no history for this game (won't count until there is)`),
    ...(recorded ? [`already recorded in the app: hand ${recorded.id} (${(recorded.players || []).map((hp) => `${hp.playerName} ${(hp.cards || []).join('')} ${hp.handType || '-'}`).join(', ')})`] : []),
  ];
  const dealt = seats.length === 1 && seats[0].handType === 'four_of_a_kind' && hint ? dealQuads(hint, importId) : null;
  ready.push({ line, label, game, others, seats, importId, notes, dealt, skip: !!recorded });
}

for (const r of ready) {
  const who = r.seats.map((s) => `${s.name}→${s.seat.name}${s.seat.uid ? '' : ' (no account)'}`).join(', ');
  const time = new Date(r.game.started + TAIPEI).toISOString().slice(0, 16).replace('T', ' ');
  const of = r.others ? ` (of ${r.others + 1} that night)` : '';
  console.log(`${r.skip ? 'SKIP' : 'OK  '} ${r.label}\n     game ${r.game.id} ${r.game.type || 'cash'} ${time}, ${r.game.players?.length || 0} players${of} · ${who}`);
  if (r.dealt && !r.skip) console.log(`     cards ${r.dealt.cards.join(' ')} | ${r.dealt.communityCards.join(' ')}`);
  for (const note of r.notes) console.log(`     ! ${note}`);
}
if (problems.length) {
  console.log(`\nNot going in (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
for (const s of input.skipped || []) console.log(`  - ${s.date} ${s.text}: left out (${s.why})`);

const toWrite = ready.filter((r) => !r.skip);
const perPlayer = {};
for (const r of toWrite) {
  for (const s of r.seats) {
    const key = s.seat.name;
    perPlayer[key] ||= { four_of_a_kind: 0, straight_flush: 0, royal_flush: 0 };
    perPlayer[key][s.handType] += 1;
  }
}
console.log('\nPer player (what goes in):');
for (const [name, c] of Object.entries(perPlayer).sort((a, b) => b[1].four_of_a_kind - a[1].four_of_a_kind)) {
  console.log(`  ${name}: 四條 ${c.four_of_a_kind} · 同花順 ${c.straight_flush} · 皇家 ${c.royal_flush}`);
}
console.log(`\n${toWrite.length} hand(s) to add, ${ready.length - toWrite.length} already in the app, ${problems.length} not matched`);

if (!write) {
  console.log('Dry run: nothing written. Add --write to add them.');
  process.exit(0);
}
for (const r of toWrite) {
  // Inside the game's own time, so the hand lists under the period it counts in
  const at = Math.max(r.game.started || 0, (r.game.finished || r.game.started) - 60e3);
  await db.collection('games').doc(r.game.id).collection('hands').doc(r.importId).set({
    communityCards: r.dealt ? r.dealt.communityCards : [],
    players: r.seats.map((s) => ({
      playerId: s.seat.id,
      playerName: s.seat.name || s.name,
      playerUid: s.seat.uid || null,
      cards: r.dealt ? r.dealt.cards : [],
      handType: s.handType,
      chips: 0,
      ...(s.winner ? { winner: true } : {}),
    })),
    ...(r.line.note ? { note: r.line.note } : {}),
    importedFrom: 'hand-list',
    createdAt: at,
  });
  console.log(`added ${r.game.id}/hands/${r.importId}`);
}
console.log(`${toWrite.length} hand(s) added; the hands trigger recounts each game's titles and stats.`);
