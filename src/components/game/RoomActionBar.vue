<template>
  <div class="room-action-bar">
    <slot />
  </div>
</template>

<script setup>
// Room actions pinned above the app's bottom navigation (h-16 + safe area).
</script>

<style scoped>
.room-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  max-width: 28rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(8px);
  border-top: 1px solid #334155;
}
.room-action-bar :deep(.bar-btn) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  color: #e2e8f0;
  background: rgba(51, 65, 85, 0.7);
  white-space: nowrap;
}
.room-action-bar :deep(.bar-btn.primary) {
  margin-left: auto;
  background: #f59e0b;
  color: #111827;
  font-weight: 700;
}
</style>
