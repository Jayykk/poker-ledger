/**
 * Firestore database accessor.
 *
 * All app data lives in the named `poker-tw` database (not the legacy
 * `(default)` one). Admin SDK's getFirestore() targets `(default)` unless a
 * database id is passed, so this wraps it to bind every call to `poker-tw`.
 * Import { getFirestore } from this module instead of from 'firebase-admin/firestore'
 * so every handler talks to the same database. Override with FIRESTORE_DATABASE_ID.
 */

import { getFirestore as adminGetFirestore } from 'firebase-admin/firestore';

export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'poker-tw';

/**
 * Get the Firestore instance bound to the app's database.
 * The Admin SDK caches one instance per (app, databaseId), so this is cheap to
 * call repeatedly.
 * @return {FirebaseFirestore.Firestore} Firestore for the `poker-tw` database
 */
export function getFirestore() {
  return adminGetFirestore(FIRESTORE_DATABASE_ID);
}
