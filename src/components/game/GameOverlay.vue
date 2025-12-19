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
  align-items: center;
  justify-content: center;
  z-index: 998;

  /* Spec: transparent + non-intrusive */
  background: transparent;
  pointer-events: none;
}

.game-overlay-content {
  /* Spec: keep semi-transparent box */
  background: rgba(0, 0, 0, 0.6);
  border-radius: 16px;
  padding: 20px 28px;
  text-align: center;
  color: white;

  /* Spec: content remains interactive */
  pointer-events: auto;

  /* Smaller, cleaner typography */
  font-size: 14px;
  line-height: 1.4;

  max-width: 420px;
}

@media (max-width: 768px) {
  .game-overlay-content {
    padding: 16px 20px;
    max-width: 90vw;
  }
}
</style>
