<template>
  <div class="room-action-bar">
    <slot />
  </div>
</template>

<script setup>
// Room actions pinned to the bottom of the screen (the app's navigation is
// hidden in rooms), clear of the home indicator.
</script>

<style scoped>
.room-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  max-width: 28rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
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
/* Wider screens: the room widens (max-w-3xl / max-w-5xl) and this follows */
@media (min-width: 768px) { .room-action-bar { max-width: 48rem; } }
@media (min-width: 1024px) { .room-action-bar { max-width: 64rem; } }
</style>
