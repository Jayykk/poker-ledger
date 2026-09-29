#!/usr/bin/env node

/**
 * Backfill tournament base-buy-in and rebuy snapshots in history_sub.
 *
 * Usage:
 *   node functions/scripts/backfill_tournament_metrics.js --dry-run
 *   node functions/scripts/backfill_tournament_metrics.js [--uid <uid>]
 *
 * Run backfill_leaderboard_stats.js afterwards to rebuild aggregate documents.
 * Options: --dry-run, --uid <uid>, --help
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { buildTournamentMetricPatch } from '../src/utils/tournamentHistoryBackfill.js';

const filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(filename), '..', '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(readFileSync(filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const dryRun = args.includes('--dry-run');
const uidIndex = args.indexOf('--uid');
const onlyUid = uidIndex >= 0 ? args[uidIndex + 1] : null;
if (uidIndex >= 0 && !onlyUid) {
  console.error('--uid requires a value');
  process.exit(1);
}

/**
 * Run the tournament metric backfill.
 * @return {Promise<void>} Completes after all selected histories are scanned.
 */
async function main() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const credentialPaths = [
    join(repoRoot, 'serviceAccountKey.json'),
    join(repoRoot, 'service-account.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);
  const credentialPath = credentialPaths.find(existsSync);
  initializeApp(credentialPath
    ? { credential: cert(JSON.parse(readFileSync(credentialPath, 'utf8'))) }
    : undefined);
  const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');

  const summary = {
    resolved: 0, unknown: 0, skipped: 0,
    alreadyComplete: 0, failures: 0, writes: 0,
  };
  const userSnaps = onlyUid
    ? [await db.collection('users').doc(onlyUid).get()]
    : (await db.collection('users').select().get()).docs;

  for (const userSnap of userSnaps) {
    const uid = userSnap.id;
    const historySnap = await db.collection('users')
      .doc(uid).collection('history_sub').get();
    for (const historyDoc of historySnap.docs) {
      try {
        const history = historyDoc.data();
        if (history.type !== 'tournament') {
          summary.skipped += 1;
          continue;
        }
        const gameSnap = await db.collection('games')
          .doc(history.gameId || historyDoc.id).get();
        const result = buildTournamentMetricPatch(
          history, gameSnap.exists ? gameSnap.data() : null, uid,
        );
        if (result.status === 'resolved') {
          summary.resolved += 1;
          if (!dryRun) {
            await historyDoc.ref.set(result.patch, { merge: true });
            summary.writes += 1;
          }
        } else if (result.status === 'already-complete') {
          summary.alreadyComplete += 1;
        } else {
          summary[result.status] += 1;
        }
      } catch (error) {
        summary.failures += 1;
        console.error(`${uid}/${historyDoc.id}: ${error.message}`);
      }
    }
  }

  console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
  if (summary.failures > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
