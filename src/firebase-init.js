import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD1ftywMejmcdqzSXZ7CKhiJKMBeCrsyIQ",
  authDomain: "poker-ledger-a0e06.firebaseapp.com",
  projectId: "poker-ledger-a0e06",
  storageBucket: "poker-ledger-a0e06.firebasestorage.app",
  messagingSenderId: "825053137358",
  appId: "1:825053137358:web:905bd41a2005a0f6cb039f",
  measurementId: "G-7SBN8260L2"
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
