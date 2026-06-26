import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Detect LINE's in-app browser (blocks IndexedDB / BroadcastChannel)
const isLineClient = /Line\//i.test(navigator.userAgent);

// Firebase configuration
// Note: These credentials are safe to expose in client-side code as they identify
// the Firebase project but do not grant access without proper security rules
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD1ftywMejmcdqzSXZ7CKhiJKMBeCrsyIQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "poker-ledger-a0e06.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "poker-ledger-a0e06",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "poker-ledger-a0e06.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "825053137358",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:825053137358:web:905bd41a2005a0f6cb039f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7SBN8260L2"
};

const app = initializeApp(firebaseConfig);
export { app };

// 直接用 initializeAuth 並強制 browserLocalPersistence，完全繞開 IndexedDB 問題
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});

// App data lives in the named `poker-tw` database, not the legacy `(default)`
// one — passed as the databaseId (3rd arg) to every initializeFirestore() call.
// Single source for the frontend; override per-env with VITE_FIRESTORE_DATABASE_ID.
const FIRESTORE_DATABASE_ID = import.meta.env.VITE_FIRESTORE_DATABASE_ID || 'poker-tw';

// Region the Cloud Functions are deployed to. Must match the backend or
// httpsCallable() resolves to us-central1 and 404s. Override with VITE_FUNCTIONS_REGION.
const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'asia-east1';

// Firestore: same issue — use memory cache in LINE browser.
let db;
try {
  if (isLineClient) {
    db = initializeFirestore(app, { localCache: memoryLocalCache() }, FIRESTORE_DATABASE_ID);
  } else {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, FIRESTORE_DATABASE_ID);
  }
} catch (e) {
  console.warn('Firestore persistent cache failed, using memory cache:', e);
  db = initializeFirestore(app, { localCache: memoryLocalCache() }, FIRESTORE_DATABASE_ID);
}
export { db };

// Shared Functions instance pinned to the backend region. Import this
// everywhere instead of calling getFunctions() so the region stays consistent.
export const functions = getFunctions(app, FUNCTIONS_REGION);
