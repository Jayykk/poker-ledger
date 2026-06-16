#!/usr/bin/env node

/**
 * One-time cleanup: delete stale / orphan online-poker rooms (pokerGames).
 *
 * Why this exists: before the periodic `handleRoomSweep` was added, a room's
 * only auto-close was a single best-effort Cloud Task. When that task was lost
 * (queue/region/signature change, emulator restart, deploy gap) the room stayed
 * `waiting` forever — the "orphan room" symptom in the lobby. This script clears
 * the existing backlog. Going forward, `handleRoomSweep` keeps things tidy and
 * this script should rarely be needed.
 *
 * A room is considered STALE when:
 *   - status is closed / completed / ended (already done), OR
 *   - it is idle: meta.lastActivityAt older than --idle-minutes (default 60),
 *     OR has no lastActivityAt at all (legacy doc).
 *
 * SAFETY: dry-run by default. Nothing is deleted unless you pass --yes.
 * Deletion is recursive (removes events/hands/private/history subcollections).
 *
 * Usage:
 *   node scripts/delete_stale_poker_rooms.js                 # dry run (lists targets)
 *   node scripts/delete_stale_poker_rooms.js --yes           # actually delete
 *   node scripts/delete_stale_poker_rooms.js --idle-minutes 120 --yes
 *   node scripts/delete_stale_poker_rooms.js --include-active --yes   # also delete idle 'playing' rooms
 *
 * Prerequisites:
 *   - Firebase Admin credentials: set GOOGLE_APPLICATION_CREDENTIALS or place
 *     serviceAccountKey.json / service-account.json at the repo root.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const options = {
  confirm: args.includes('--yes'),
  includeActive: args.includes('--include-active'),
  idleMinutes: 60,
};
const idleIdx = args.indexOf('--idle-minutes');
if (idleIdx !== -1 && args[idleIdx + 1]) {
  const n = Number(args[idleIdx + 1]);
  if (Number.isFinite(n) && n >= 0) options.idleMinutes = n;
}

console.log('Cleanup options:', options);
if (!options.confirm) {
  console.log('\n*** DRY RUN — no documents will be deleted. Pass --yes to delete. ***\n');
}

// --- Initialize Firebase Admin (same convention as migrate_entries_to_events.js) ---
try {
  const serviceAccountPaths = [
    join(__dirname, '..', 'serviceAccountKey.json'),
    join(__dirname, '..', 'service-account.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  let serviceAccount = null;
  for (const path of serviceAccountPaths) {
    if (path && existsSync(path)) {
      const { default: sa } = await import(path, { assert: { type: 'json' } });
      serviceAccount = sa;
      console.log(`Using service account from: ${path}`);
      break;
    }
  }

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    console.log('Using default application credentials');
    initializeApp();
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  console.log('Set GOOGLE_APPLICATION_CREDENTIALS or place a service account file at the repo root.');
  process.exit(1);
}

const db = getFirestore();

/** Resolve a Firestore Timestamp-ish value to ms, or null. */
function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return null;
}

function classify(game, nowMs) {
  const status = game?.status;
  if (status === 'closed' || status === 'completed' || status === 'ended') {
    return { stale: true, reason: `status=${status}` };
  }

  const lastMs = toMillis(game?.meta?.lastActivityAt);
  const idleMin = lastMs === null ? Infinity : Math.floor((nowMs - lastMs) / 60000);
  const idleEnough = idleMin >= options.idleMinutes;

  if (status === 'playing' && !options.includeActive) {
    return { stale: false, reason: `playing (idle ${idleMin}m, use --include-active)` };
  }
  if (idleEnough) {
    return { stale: true, reason: `${status} idle ${idleMin === Infinity ? 'forever' : idleMin + 'm'}` };
  }
  return { stale: false, reason: `${status} idle ${idleMin}m (< ${options.idleMinutes}m)` };
}

async function main() {
  const nowMs = Date.now();
  const snapshot = await db.collection('pokerGames').get();
  console.log(`Scanning ${snapshot.size} pokerGames docs...\n`);

  let deleted = 0;
  let kept = 0;

  for (const docSnap of snapshot.docs) {
    const game = docSnap.data();
    const { stale, reason } = classify(game, nowMs);
    const tag = `${docSnap.id}  [${reason}]  seated=${
      Object.values(game?.seats || {}).filter((s) => s !== null).length
    }`;

    if (!stale) {
      kept += 1;
      console.log(`KEEP   ${tag}`);
      continue;
    }

    if (options.confirm) {
      await db.recursiveDelete(docSnap.ref);
      deleted += 1;
      console.log(`DELETE ${tag}`);
    } else {
      console.log(`WOULD DELETE ${tag}`);
      deleted += 1;
    }
  }

  console.log(`\nDone. ${options.confirm ? 'Deleted' : 'Would delete'}: ${deleted}, kept: ${kept}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
