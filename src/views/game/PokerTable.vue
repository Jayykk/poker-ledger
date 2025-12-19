<template>
  <div class="poker-table-view">
    <div class="game-hud">
      <button type="button" class="hud-btn left" aria-label="Back" @click="handleBack">←</button>
      <button type="button" class="hud-btn right" aria-label="Menu" @click="handleMenu">☰</button>
    </div>
    <PokerTable />
  </div>
</template>

<script setup>
import PokerTable from '../../components/game/PokerTable.vue';

import { useRouter } from 'vue-router';

const router = useRouter();

const handleBack = () => {
  router.push({ name: 'GameLobby' });
};

const handleMenu = () => {
  const hamburger = document.querySelector('.poker-game-view .btn-hamburger');
  if (hamburger && typeof hamburger.click === 'function') hamburger.click();
};
</script>

<style scoped>
/* Ensure the container for floating buttons doesn't block clicks */
.game-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 0;
  z-index: 100;
}

/* Style and position the floating buttons tightly to the top */
.hud-btn {
  position: absolute;
  top: 8px;
  /* Add safe-area support for notched phones */
  top: calc(8px + env(safe-area-inset-top));
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.hud-btn.left {
  left: 15px;
}

.hud-btn.right {
  right: 15px;
}

/* Pull the table upwards now that the header is gone */
:deep(.poker-table-felt) {
  /* Ensure this is the only margin-top being applied */
  margin-top: 20px !important;

  /* Keep the rounded rectangle shape and smaller size */
  width: 80vw;
  height: 55vh;
  border-radius: 40px;
  position: relative;
  margin-left: auto;
  margin-right: auto;
}
</style>
