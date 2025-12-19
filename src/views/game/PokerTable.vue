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
  margin: 80px auto 0 auto;
  border-radius: 40px;
}
</style>
