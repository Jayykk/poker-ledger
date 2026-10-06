#!/usr/bin/env node

/**
 * One-off: 稱號 became opt-in (title off, no frame, no room titles until the
 * player turns them on in 我的). userTitles docs written before that carry
 * the old defaults (auto title, auto frame, room titles on) that the backfill
 * stored, not anything the player chose — reset those to the new defaults and
 * rewrite the display. Docs whose prefs the player changed are left alone.
 *
 * Idempotent: once reset, prefs no longer look like the old defaults.
 *
 * Usage (run so that functions/node_modules resolves; cwd doesn't matter):
 *   node functions/scripts/migrate_title_prefs_opt_in.js [--dry-run]
 *
 * Credentials: serviceAccountKey.json at repo root / functions, or
 * GOOGLE_APPLICATION_CREDENTIALS. FIRESTORE_DATABASE_ID overrides 'poker-tw'.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const dryRun = process.argv.includes('--dry-run');

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { DEFAULT_TITLE_PREFS, isLegacyDefaultPrefs, resolveDisplay } = await import('../src/utils/titleRules.js');

const keyPath = [
  join(REPO_ROOT, 'serviceAccountKey.json'),
  join(REPO_ROOT, 'functions', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
].filter(Boolean).find((path) => existsSync(path));
if (keyPath) initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
else initializeApp();

const db = getFirestore(process.env.FIRESTORE_DATABASE_ID || 'poker-tw');
const snap = await db.collection('userTitles').get();

let reset = 0;
let kept = 0;
for (const docSnap of snap.docs) {
  const data = docSnap.data();
  if (!isLegacyDefaultPrefs(data.prefs)) {
    kept++;
    continue;
  }
  reset++;
  if (dryRun) continue;
  const prefs = { ...DEFAULT_TITLE_PREFS };
  await docSnap.ref.set({
    prefs,
    display: resolveDisplay(data.unlocked || {}, prefs),
    updatedAt: FieldValue.serverTimestamp(),
  }, { mergeFields: ['prefs', 'display', 'updatedAt'] });
}

console.log(`${dryRun ? '[dry run] ' : ''}${snap.size} docs: ${reset} reset to opt-in defaults, ${kept} kept (set by the player)`);
