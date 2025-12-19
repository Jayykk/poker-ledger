<template>
  <div class="game-overlay">
    <div class="game-overlay-content">
      <slot />
    </div>
  </div>
</template>

<script setup>
// Presentation-only overlay.
// Container is non-blocking; content remains interactive.
</script>

<style scoped>
.game-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 998;

  /* Bottom-center capsule placement */
  padding: 0 16px 20px;

  /* Spec: transparent + non-intrusive */
  background: transparent;
  pointer-events: none;
}

.game-overlay-content {
  /* Spec: keep semi-transparent capsule */
  background: rgba(0, 0, 0, 0.6);
  border-radius: 9999px;
  padding: 10px 12px;
  text-align: left;
  color: white;

  /* Spec: content remains interactive */
  pointer-events: auto;

  /* Smaller, cleaner typography */
  font-size: 14px;
  line-height: 1.2;

  display: flex;
  align-items: center;
  gap: 12px;

  max-width: min(520px, 100%);
}

@media (max-width: 768px) {
  .game-overlay-content {
    max-width: 90vw;
  }
}
</style>
