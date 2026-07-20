#!/usr/bin/env node

/**
 * Migration Script: legacy `users/{uid}.history` array → `users/{uid}/history_sub` docs
 *
 * Goal: converge on history_sub as the ONLY per-game history source so the
 * client-side legacy-merge logic (user.js store / Leaderboard.vue) can be deleted
 * and the upcoming leaderboardStats recompute function reads a single source.
 *
 * Behavior:
 * - Legacy records WITH a gameId whose history_sub/{gameId} doc already exists are
 *   skipped — the Cloud Function projection is canonical and must not be overwritten.
 * - Legacy records WITHOUT a gameId get doc id `legacy-{arrayIndex}`. This matches the
 *   fallback merge key the frontend already uses (user.js getRecordKey / Leaderboard),
 *   so during the interim period (array still present) the client dedup keeps working
 *   and nothing double-counts.
 * - Migrated docs carry `projectionUpdatedAt = Timestamp(createdAt)`. REQUIRED: the
 *   user store queries history_sub with orderBy('projectionUpdatedAt') — docs missing
 *   that field are invisible to the query. Using the original game time (not now)
 *   keeps recency ordering honest under the query's limit(50).
 * - Idempotent: doc ids are deterministic and existing docs are never overwritten,
 *   so re-running is safe.
 *
 * Usage (run so that functions/node_modules resolves; cwd doesn't matter):
 *   node functions/scripts/migrate_legacy_history_to_history_sub.js [options]
 *
 * Options:
 *   --help            Show usage and exit
 *   --dry-run         Show what would be migrated without writing (default: false)
 *   --uid <uid>       Process a single user only
 *   --verify          Read-only check: merged(legacy + history_sub) totals must equal
 *                     history_sub-only totals for every user (run AFTER migration)
 *   --delete-legacy   For users that pass verification: back up the legacy array to a
 *                     local JSON file, then delete the `history` field. Refuses to
 *                     touch users that fail verification.
 *   --backup-dir <p>  Backup directory for --delete-legacy
 *                     (default: <repo>/scripts-output/legacy-history-backups)
 *
 * Recommended sequence:
 *   1. node ... --dry-run                 # preview counts
 *   2. node ... --uid <yourUid>           # pilot on one account, check the app UI
 *   3. node ...                           # migrate everyone
 *   4. node ... --verify                  # must report 0 mismatches
 *   5. node ... --delete-legacy           # backup + remove legacy arrays
 *
 * Prerequisites:
 *   - serviceAccountKey.json / service-account.json at repo root or functions/,
 *     or GOOGLE_APPLICATION_CREDENTIALS pointing at one (production credentials —
 *     maintainer runs this manually, same as migrate_entries_to_events.js)
 *   - FIRESTORE_DATABASE_ID env var to override the default 'poker-tw'
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// CLI parsing (before any firebase import so --help works without credentials)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function flagValue(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const options = {
  dryRun: args.includes('--dry-run'),
  verify: args.includes('--verify'),
  deleteLegacy: args.includes('--delete-legacy'),
  uid: flagValue('--uid'),
  backupDir: flagValue('--backup-dir') ||
    join(REPO_ROOT, 'scripts-output', 'legacy-history-backups'),
};

if (args.includes('--help')) {
  const header = readFileSync(__filename, 'utf8').split('*/')[0];
  console.log(header.replace(/^\/\*\*?/, ''));
  process.exit(0);
}

if (options.deleteLegacy && options.dryRun) {
  console.log('NOTE: --delete-legacy with --dry-run will only report what would be deleted.');
}

console.log('Options:', options, '\n');

// ---------------------------------------------------------------------------
// Firebase Admin init
// ---------------------------------------------------------------------------

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');

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
      // readFileSync + JSON.parse instead of import-assertions: Node 22+ removed
      // `assert { type: 'json' }` (the older migrate script's approach breaks there).
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

// ---------------------------------------------------------------------------
// Normalization helpers (mirror src/store/modules/user.js semantics)
// ---------------------------------------------------------------------------

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/** Merge key — MUST stay identical to the frontend fallback (`legacy-${index}`). */
function legacyDocId(record, index) {
  if (record.gameId && typeof record.gameId === 'string') {
    // Firestore doc ids cannot contain '/'
    return record.gameId.replace(/\//g, '_');
  }
  return `legacy-${index}`;
}

function buildMigratedDoc(record, docId) {
  const createdAt =
    toMillis(record.createdAt) ||
    toMillis(record.completedAt) ||
    toMillis(record.date) ||
    Date.now();

  return {
    // Preserve every legacy field first (gameName, type, placement, settlement, ...),
    // then override the normalized/required ones.
    ...record,
    gameId: docId,
    status: 'completed',
    date: new Date(createdAt).toISOString(),
    createdAt,
    completedAt: toMillis(record.completedAt) || createdAt,
    profit: Number(record.profit) || 0,
    rate: Number(record.rate) || 1,
    sourceCollection: 'legacy',
    sourceVersion: 1,
    migratedAt: FieldValue.serverTimestamp(),
    projectionUpdatedAt: Timestamp.fromMillis(createdAt),
  };
}

// ---------------------------------------------------------------------------
// Verification: merged(legacy + sub) must equal sub-only, per user
// ---------------------------------------------------------------------------

function summarize(records) {
  let profitSum = 0;
  for (const r of records) profitSum += Number(r.profit) || 0;
  return { count: records.length, profitSum: Math.round(profitSum * 100) / 100 };
}

function verifyUser(legacyRecords, subDocs) {
  const merged = new Map();
  legacyRecords.forEach((record, index) => {
    merged.set(record.gameId || `legacy-${index}`, record);
  });
  subDocs.forEach((docSnap) => {
    const data = docSnap.data();
    merged.set(data.gameId || docSnap.id, data);
  });

  const mergedStats = summarize([...merged.values()]);
  const subStats = summarize(subDocs.map((d) => d.data()));
  const ok =
    mergedStats.count === subStats.count &&
    Math.abs(mergedStats.profitSum - subStats.profitSum) < 0.01;

  return { ok, mergedStats, subStats };
}

// ---------------------------------------------------------------------------
// Per-user processing
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 400;

async function commitInChunks(writes) {
  for (let i = 0; i < writes.length; i += MAX_BATCH_SIZE) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + MAX_BATCH_SIZE)) {
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

async function migrateUser(userDoc, stats) {
  const legacy = Array.isArray(userDoc.data().history) ? userDoc.data().history : [];
  if (legacy.length === 0) return;
  stats.usersWithLegacy++;

  // .select() with no fields fetches doc ids only (cheap existence check)
  const existingSnap = await userDoc.ref.collection('history_sub').select().get();
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));

  const writes = [];
  legacy.forEach((record, index) => {
    const docId = legacyDocId(record, index);
    if (existingIds.has(docId)) {
      stats.skippedExisting++;
      return;
    }
    writes.push({
      ref: userDoc.ref.collection('history_sub').doc(docId),
      data: buildMigratedDoc(record, docId),
    });
  });

  if (writes.length > 0) {
    console.log(
      `  ${userDoc.id}: ${writes.length} to migrate, ` +
      `${legacy.length - writes.length} already in history_sub`
    );
    if (!options.dryRun) await commitInChunks(writes);
    stats.docsCreated += writes.length;
  }
}

async function verifyAndReport(userDoc, stats) {
  const legacy = Array.isArray(userDoc.data().history) ? userDoc.data().history : [];
  if (legacy.length === 0) return null;
  stats.usersWithLegacy++;

  const subSnap = await userDoc.ref.collection('history_sub').get();
  const result = verifyUser(legacy, subSnap.docs);

  if (result.ok) {
    stats.verifiedOk++;
  } else {
    stats.verifiedMismatch++;
    console.error(
      `  MISMATCH ${userDoc.id}: merged=${JSON.stringify(result.mergedStats)} ` +
      `subOnly=${JSON.stringify(result.subStats)} — run migration for this user first`
    );
  }
  return result;
}

async function deleteLegacyForUser(userDoc, stats) {
  const legacy = Array.isArray(userDoc.data().history) ? userDoc.data().history : [];
  if (legacy.length === 0) return;

  const result = await verifyAndReport(userDoc, stats);
  if (!result || !result.ok) return; // never delete unverified data

  if (!options.dryRun) {
    mkdirSync(options.backupDir, { recursive: true });
    const backupPath = join(options.backupDir, `${userDoc.id}.json`);
    writeFileSync(
      backupPath,
      JSON.stringify({ uid: userDoc.id, exportedAt: new Date().toISOString(), history: legacy }, null, 2)
    );
    await userDoc.ref.update({ history: FieldValue.delete() });
    console.log(`  ${userDoc.id}: legacy array deleted (backup: ${backupPath})`);
  } else {
    console.log(`  ${userDoc.id}: would delete legacy array (${legacy.length} records)`);
  }
  stats.legacyDeleted++;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const mode = options.deleteLegacy ? 'delete-legacy' : options.verify ? 'verify' : 'migrate';
  console.log(`Mode: ${mode}${options.dryRun ? ' (DRY RUN)' : ''}\n`);

  const stats = {
    usersScanned: 0,
    usersWithLegacy: 0,
    docsCreated: 0,
    skippedExisting: 0,
    verifiedOk: 0,
    verifiedMismatch: 0,
    legacyDeleted: 0,
  };

  let userDocs;
  if (options.uid) {
    const snap = await db.collection('users').doc(options.uid).get();
    if (!snap.exists) {
      console.error(`User ${options.uid} not found`);
      process.exit(1);
    }
    userDocs = [snap];
  } else {
    const snap = await db.collection('users').get();
    userDocs = snap.docs;
  }

  for (const userDoc of userDocs) {
    stats.usersScanned++;
    if (mode === 'migrate') await migrateUser(userDoc, stats);
    else if (mode === 'verify') await verifyAndReport(userDoc, stats);
    else await deleteLegacyForUser(userDoc, stats);
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(stats, null, 2));
  if (options.dryRun) console.log('\nThis was a dry run. Re-run without --dry-run to apply.');

  if (stats.verifiedMismatch > 0) process.exit(2);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
