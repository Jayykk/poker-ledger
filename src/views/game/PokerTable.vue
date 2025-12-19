<template>
  <PokerTable />
</template>

<script setup>
import PokerTable from '../../components/game/PokerTable.vue';
</script>

<style scoped>
/* View-level override: switch the felt from oval to rounded rectangle. */
:deep(.poker-table-felt) {
  border-radius: 50px;
}
</style>
