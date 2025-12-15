import { computed } from 'vue';
import { useAuthStore } from '../store/modules/auth.js';

/**
 * Composable for authentication
 */
export function useAuth() {
  const authStore = useAuthStore();

  const isAuthenticated = computed(() => authStore.isAuthenticated);
  const isGuest = computed(() => authStore.isGuest);
  const user = computed(() => authStore.user);
  const displayName = computed(() => authStore.displayName);
  const loading = computed(() => authStore.loading);
  const error = computed(() => authStore.error);

  const register = async (email, password, name) => {
    return await authStore.register(email, password, name);
  };

  const login = async (email, password) => {
    return await authStore.login(email, password);
  };

  const guestLogin = async () => {
    return await authStore.guestLogin();
  };

  const logout = async () => {
    return await authStore.logout();
  };

  const updateGuestDisplayName = async (name) => {
    return await authStore.updateGuestDisplayName(name);
  };

  const linkEmailToGuest = async (email, password, name) => {
    return await authStore.linkEmailToGuest(email, password, name);
  };

  return {
    isAuthenticated,
    isGuest,
    user,
    displayName,
    loading,
    error,
    register,
    login,
    guestLogin,
    logout,
    updateGuestDisplayName,
    linkEmailToGuest
  };
}
