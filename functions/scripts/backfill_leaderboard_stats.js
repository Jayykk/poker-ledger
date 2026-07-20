#!/usr/bin/env node

/**
 * Backfill Script: rebuild leaderboardStats/{uid}_{period} for every user.
 *
 * Runs the exact same recompute the Cloud Function uses after each settlement
 * (functions/src/handlers/leaderboardStats.js), so a backfill and a live update
 * can never disagree. Fully idempotent — safe to re-run any time; it also
 * DELETES stat docs for periods that no longer have games.
 *
 * ORDER MATTERS: run migrate_legacy_history_to_history_sub.js FIRST.
 * The recompute reads history_sub only; legacy `users.history` arrays that have
 * not been migrated yet are invisible to it.
 *
 * Usage (run so that functions/node_modules resolves; cwd doesn't matter):
 *   node functions/scripts/backfill_leaderboard_stats.js [options]
 *
 * Options:
 *   --help         Show usage and exit
 *   --uid <uid>    Recompute a single user only
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

  for (const uid of uids) {
    try {
      const result = await recomputeLeaderboardStatsForUser(db, uid);
      totalPeriods += result.periods;
      totalDeleted += result.deleted;
      if (result.periods > 0 || result.deleted > 0) {
        console.log(`  ${uid}: ${result.periods} period docs, ${result.deleted} stale deleted`);
      }
    } catch (error) {
      failures++;
      console.error(`  FAILED ${uid}:`, error.message);
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify({ users: uids.length, totalPeriods, totalDeleted, failures }, null, 2));
  if (failures > 0) process.exit(2);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
