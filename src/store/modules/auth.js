import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  updateProfile,
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase-init.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const loading = ref(false);
  const error = ref('');

  const isAuthenticated = computed(() => !!user.value);
  const isGuest = computed(() => user.value?.isAnonymous || false);
  const displayName = computed(() => user.value?.displayName || 'Guest');

  /**
   * Initialize auth state listener
   */
  const initAuth = () => {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, (authUser) => {
        user.value = authUser;
        resolve(authUser);
      });
    });
  };

  /**
   * Register new user
   */
  const register = async (email, password, name) => {
    loading.value = true;
    error.value = '';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        name,
        email,
        createdAt: Date.now()
      });
      return true;
    } catch (err) {
      console.error('Register error:', err);
      error.value = err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Login with email/password
   */
  const login = async (email, password) => {
    loading.value = true;
    error.value = '';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (err) {
      console.error('Login error:', err);
      error.value = err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Guest login
   */
  const guestLogin = async () => {
    loading.value = true;
    error.value = '';
    try {
      await signInAnonymously(auth);
      return true;
    } catch (err) {
      console.error('Guest login error:', err);
      error.value = 'Guest login failed: ' + err.message;
      return false;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    try {
      await signOut(auth);
      user.value = null;
      return true;
    } catch (err) {
      console.error('Logout error:', err);
      return false;
    }
  };

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isGuest,
    displayName,
    initAuth,
    register,
    login,
    guestLogin,
    logout
  };
});
