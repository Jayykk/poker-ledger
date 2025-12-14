import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

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
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support persistence.');
  }
});
