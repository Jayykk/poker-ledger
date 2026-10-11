#!/usr/bin/env node

/**
 * READ-ONLY: the 稱號 ladders of this build against everyone's all-time stats.
 *
 * Reads every leaderboardStats doc with period 'all' (nothing else, writes
 * nothing) and prints, per title family, how many players reach each of the
 * ten tiers (and the highest metric value), then how many titles each player
 * would hold (titleCount: percentiles + histogram) and how many would earn
 * each 頭像框 with the current FRAME_TIERS. Use it to pick new FRAME_TIERS
 * (titleRules.js FRAME_MIN_*) before running the --rebuild-titles backfill.
 *
 * Usage (run so that functions/node_modules resolves; cwd doesn't matter):
 *   node functions/scripts/simulate_title_tiers.js [options]
 *
 * Options:
 *   --help          Show usage and exit
 *   --skip-hidden   Leave out anonymous / nameless accounts (hidden: true),
 *                   the ones the leaderboard never shows
 *   --json          Print the summary as JSON instead of tables
 *
 * Prerequisites: same credentials setup as backfill_leaderboard_stats.js
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
  console.log(header.replace(/^#!.*\r?\n\s*/, '').replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const skipHidden = args.includes('--skip-hidden');
const asJson = args.includes('--json');

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { summarizeTitleTiers, formatTitleTierSummary } = await import('../src/utils/titleTierStats.js');

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
      console.error(`Using service account from: ${path}`);
      break;
    }
  }

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    console.error('Using default application credentials');
    initializeApp();
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  process.exit(1);
}

const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');

async function run() {
  // Reads only: one query over the all-time docs
  const snap = await db.collection('leaderboardStats').where('period', '==', 'all').get();
  const all = snap.docs.map((docSnap) => docSnap.data());
  const docs = skipHidden ? all.filter((data) => !data.hidden) : all;
  const summary = summarizeTitleTiers(docs);
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`All-time stats docs: ${all.length}${skipHidden ? ` (${all.length - docs.length} hidden left out)` : ''}`);
  for (const line of formatTitleTierSummary(summary)) console.log(line);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Simulation failed:', error);
    process.exit(1);
  });
