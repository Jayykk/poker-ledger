import { onMounted, onUnmounted } from 'vue';
import NoSleep from 'nosleep.js';

/**
 * Keeps the screen awake while the component is mounted.
 * Uses the Screen Wake Lock API where available, with a video fallback
 * for older browsers (via nosleep.js).
 */
export function useWakeLock() {
  const noSleep = new NoSleep();

  function enable() {
    noSleep.enable().catch(() => {
      // Silently ignore — likely blocked by browser policy
    });
  }

  function disable() {
    noSleep.disable();
  }

  onMounted(() => {
    // Enable on first user interaction (required by most browsers)
    const handler = () => {
      enable();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });

    // Also try enabling immediately — works if page already had interaction
    enable();
  });

  onUnmounted(() => {
    disable();
  });

  return { enable, disable };
}
