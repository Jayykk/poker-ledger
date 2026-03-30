import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, inMemoryPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';

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
export const auth = getAuth(app);
export { app }; // Export app for Functions

// Force localStorage-based persistence to avoid IndexedDB timeout issues.
// LINE browser will override this below with inMemoryPersistence.
setPersistence(auth, browserLocalPersistence).catch(e =>
  console.warn('Failed to set auth persistence:', e)
);

// LINE's in-app browser has issues with IndexedDB persistence.
// Override to in-memory persistence to prevent onAuthStateChanged from hanging.
if (isLineClient) {
  setPersistence(auth, inMemoryPersistence).catch(e =>
    console.warn('Failed to set auth persistence for LINE:', e)
  );
}

// Firestore: same issue — use memory cache in LINE browser.
let db;
try {
  if (isLineClient) {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  } else {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  }
} catch (e) {
  console.warn('Firestore persistent cache failed, using memory cache:', e);
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
}
export { db };
