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
  background: rgb(var(--tw-slate-900) / 0.94);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgb(var(--tw-slate-700));
}
.room-action-bar :deep(.bar-btn) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  color: rgb(var(--tw-slate-200));
  background: rgb(var(--tw-slate-700) / 0.7);
  white-space: nowrap;
}
.room-action-bar :deep(.bar-btn.primary) {
  margin-left: auto;
  background: rgb(var(--tw-amber-500));
  color: var(--on-accent);
  font-weight: 700;
}
</style>
