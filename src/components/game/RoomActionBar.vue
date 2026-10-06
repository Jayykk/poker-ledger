<template>
  <div class="room-action-bar">
    <slot />
  </div>
</template>

<script setup>
// Room actions pinned to the bottom of the screen (the app's navigation is
// hidden in rooms), clear of the home indicator. Each action is an equal-width
// tab — icon over a label — so every one reads at a glance; 結算 is the
// filled one, and `.bar-badge` puts a count on an action (e.g. draws waiting).
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
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
  background: rgb(var(--tw-slate-900) / 0.94);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgb(var(--tw-slate-700));
}
.room-action-bar :deep(.bar-btn) {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.4rem 0.25rem;
  border-radius: 0.6rem;
  font-size: 0.72rem;
  line-height: 1;
  color: rgb(var(--tw-slate-300));
  white-space: nowrap;
}
.room-action-bar :deep(.bar-btn i) {
  font-size: 1.1rem;
  color: rgb(var(--tw-slate-100));
}
.room-action-bar :deep(.bar-btn:active) {
  background: rgb(var(--tw-slate-700) / 0.7);
}
.room-action-bar :deep(.bar-btn.primary) {
  background: rgb(var(--tw-amber-500));
  color: var(--on-accent);
  font-weight: 700;
}
.room-action-bar :deep(.bar-btn.primary i) {
  color: var(--on-accent);
}
.room-action-bar :deep(.bar-badge) {
  position: absolute;
  top: 0.15rem;
  left: calc(50% + 0.45rem);
  min-width: 1.1rem;
  padding: 0.1rem 0.3rem;
  border-radius: 999px;
  background: rgb(var(--tw-rose-500));
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
}
/* Wider screens: the room widens (max-w-3xl / max-w-5xl) and this follows */
@media (min-width: 768px) { .room-action-bar { max-width: 48rem; } }
@media (min-width: 1024px) { .room-action-bar { max-width: 64rem; } }
</style>
