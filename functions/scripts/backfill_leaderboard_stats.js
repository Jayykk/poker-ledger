#!/usr/bin/env node

/**
 * Backfill Script: rebuild leaderboardStats/{uid}_{period} for every user.
 *
 * Runs the exact same recompute the Cloud Function uses after each settlement
 * (functions/src/handlers/leaderboardStats.js), so a backfill and a live update
 * can never disagree. Fully idempotent — safe to re-run any time; it also
 * DELETES stat docs for periods that no longer have games.
 *
 * The same recompute also evaluates each user's 稱號 into userTitles/{uid}
 * (handlers/userTitles.js), so this script is the titles backfill as well.
 *
 * Before recomputing a user, history_sub docs written before projections
 * carried `hostUid` get it copied from games/{gameId} (null when the game is
 * gone), so the 開房 title counts older games. Docs that already have the
 * field are skipped, so re-runs only read what is still missing.
 *
 * ORDER MATTERS: run migrate_legacy_history_to_history_sub.js FIRST.
 * The recompute reads history_sub only; legacy `users.history` arrays that have
 * not been migrated yet are invisible to it.
 *
 * Usage (run so that functions/node_modules resolves; cwd doesn't matter):
 *   node functions/scripts/backfill_leaderboard_stats.js [options]
 *
 * Options:
 *   --help             Show usage and exit
 *   --uid <uid>        Recompute a single user only
 *   --skip-host-uids   Don't fill missing history_sub.hostUid first
 *
 * Prerequisites: same credentials setup as migrate_legacy_history_to_history_sub.js
 * (serviceAccountKey.json at repo root / functions, or GOOGLE_APPLICATION_CREDENTIALS).
 * FIRESTORE_DATABASE_ID env var overrides the default 'poker-tw'.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);

if (args.includes('--help')) {
  const header = readFileSync(__filename, 'utf8').split('*/')[0];
  console.log(header.replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const uidIndex = args.indexOf('--uid');
const onlyUid = uidIndex !== -1 && args[uidIndex + 1] ? args[uidIndex + 1] : null;
const fillHostUids = !args.includes('--skip-host-uids');

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { recomputeLeaderboardStatsForUser } = await import('../src/handlers/leaderboardStats.js');

try {
  const serviceAccountPaths = [
    join(REPO_ROOT, 'serviceAccountKey.json'),
    join(REPO_ROOT, 'service-account.json'),
    join(REPO_ROOT, 'functions', 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  let serviceAccount = null;
  for (const path of serviceAccountPaths) {
    if (existsSync(path)) {
      serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
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
  process.exit(1);
}

const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');

// games/{gameId}.hostUid, cached across users (a game appears in every
// player's history)
const hostUidCache = new Map();
async function hostUidOf(gameId) {
  if (!hostUidCache.has(gameId)) {
    const gameSnap = await db.collection('games').doc(gameId).get();
    hostUidCache.set(gameId, gameSnap.exists ? (gameSnap.data().hostUid || null) : null);
  }
  return hostUidCache.get(gameId);
}

/** Copy hostUid onto this user's history_sub docs that predate the field. */
async function fillMissingHostUids(uid) {
  const historySnap = await db.collection('users').doc(uid).collection('history_sub').get();
  let filled = 0;
  for (const historyDoc of historySnap.docs) {
    const history = historyDoc.data();
    if (Object.prototype.hasOwnProperty.call(history, 'hostUid')) continue;
    const hostUid = await hostUidOf(history.gameId || historyDoc.id);
    await historyDoc.ref.set({ hostUid }, { merge: true });
    filled += 1;
  }
  return filled;
}

async function run() {
  let uids;
  if (onlyUid) {
    uids = [onlyUid];
  } else {
    const usersSnap = await db.collection('users').select().get();
    uids = usersSnap.docs.map((docSnap) => docSnap.id);
  }

  console.log(`Recomputing leaderboardStats for ${uids.length} user(s)...\n`);

  let totalPeriods = 0;
  let totalDeleted = 0;
  let failures = 0;
  let hostUidsFilled = 0;
  let titleDocsWritten = 0;
  let titlesUnlocked = 0;

  for (const uid of uids) {
    try {
      if (fillHostUids) hostUidsFilled += await fillMissingHostUids(uid);
      const result = await recomputeLeaderboardStatsForUser(db, uid);
      totalPeriods += result.periods;
      totalDeleted += result.deleted;
      if (result.titles?.written) titleDocsWritten += 1;
      titlesUnlocked += result.titles?.unlocked || 0;
      if (result.periods > 0 || result.deleted > 0) {
        const titles = result.titles ? `, ${result.titles.unlocked} titles` : ', titles FAILED';
        console.log(`  ${uid}: ${result.periods} period docs, ${result.deleted} stale deleted${titles}`);
      }
    } catch (error) {
      failures++;
      console.error(`  FAILED ${uid}:`, error.message);
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify({
    users: uids.length, totalPeriods, totalDeleted, hostUidsFilled, titleDocsWritten, titlesUnlocked, failures,
  }, null, 2));
  if (failures > 0) process.exit(2);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
