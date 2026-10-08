#!/usr/bin/env node

/**
 * Mark recorded hands as test data so they don't count toward 稱號
 * (handEvents skips `excludeFromTitles: true`). Nothing is deleted: the hands
 * stay where they are, and unmarking (--unmark) puts them back.
 *
 * Picks every ledger hand (games/{id}/hands) recorded before --before.
 * 2026-10-08: the hand-record test session of 2025-12-15/16 (13 hands in 9
 * test rooms: 測試排行 / test / A, B, C) — `--before 2026-01-01`.
 *
 * After marking, rebuild so the titles they gave go away:
 *   node functions/scripts/backfill_leaderboard_stats.js --hand-events --rebuild-titles
 *
 * Usage:
 *   node functions/scripts/mark_test_hands.js --before 2026-01-01 [--dry-run] [--unmark]
 *
 * Credentials: serviceAccountKey.json at repo root / functions, or
 * GOOGLE_APPLICATION_CREDENTIALS. FIRESTORE_DATABASE_ID overrides 'poker-tw'.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const unmark = args.includes('--unmark');
const beforeIndex = args.indexOf('--before');
const before = beforeIndex !== -1 ? Date.parse(args[beforeIndex + 1]) : NaN;
if (!Number.isFinite(before)) {
  console.error('Give a cutoff: --before YYYY-MM-DD');
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

const keyPath = [
  join(REPO_ROOT, 'serviceAccountKey.json'),
  join(REPO_ROOT, 'functions', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
].filter(Boolean).find((path) => existsSync(path));
if (keyPath) initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
else initializeApp();

const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');
const millis = (v) => (v?.toMillis ? v.toMillis() : Number(v) || 0);

const snap = await db.collectionGroup('hands').get();
let changed = 0;
for (const docSnap of snap.docs) {
  if (!docSnap.ref.path.startsWith('games/')) continue; // online poker hands live elsewhere
  const hand = docSnap.data();
  const at = millis(hand.createdAt);
  if (!at || at >= before) continue;
  if (unmark ? hand.excludeFromTitles !== true : hand.excludeFromTitles === true) continue;
  changed++;
  console.log(`${dryRun ? '[dry run] ' : ''}${unmark ? 'unmark' : 'mark'} ${docSnap.ref.path} (${new Date(at).toISOString()})`);
  if (!dryRun) {
    await docSnap.ref.update({ excludeFromTitles: unmark ? FieldValue.delete() : true });
  }
}
console.log(`${dryRun ? '[dry run] ' : ''}${changed} hand(s) ${unmark ? 'unmarked' : 'marked'}`);
