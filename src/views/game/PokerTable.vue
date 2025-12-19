<template>
  <PokerTable />
</template>

<script setup>
import PokerTable from '../../components/game/PokerTable.vue';
</script>

<style scoped>
/* View-level override: compact rounded-rectangle felt for mobile. */
:deep(.poker-table-felt) {
  width: 80vw;
  height: 55vh;
  margin: 20px auto 0 auto;
  border-radius: 40px;
}

/* Global HUD buttons: hug the top edge with safe-area support. */
:global(.hud-btn) {
  top: calc(8px + env(safe-area-inset-top));
}
</style>
