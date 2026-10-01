<template>
  <div class="room-header">
    <button type="button" class="hdr-btn flex-shrink-0" :aria-label="$t('room.backToLobby')" @click="$router.push('/lobby')">
      <i class="fas fa-arrow-left"></i>
    </button>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="text-white font-bold truncate">{{ name }}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" :class="badgeClass">{{ badge }}</span>
      </div>
      <div class="text-[10px] text-gray-400 truncate">{{ $t('game.host') }}: {{ hostName || $t('common.unknown') }}</div>
    </div>

    <div class="flex items-center gap-3 flex-shrink-0">
      <div class="text-right">
        <div class="text-[10px] text-gray-400">{{ valueLabel }}</div>
        <div class="font-mono text-amber-400 font-bold leading-tight">{{ value }}</div>
        <div v-if="subValue" class="text-[10px] text-rose-300 leading-tight">{{ subValue }}</div>
      </div>

      <!-- Share: copy room ID / LINE invite -->
      <div class="relative">
        <button type="button" class="hdr-btn" :aria-label="$t('room.share')" @click="toggle('share')">
          <i class="fas fa-share-alt"></i>
        </button>
        <div v-if="open === 'share'" class="hdr-menu">
          <button type="button" @click="pick('copy-id')"><i class="fas fa-copy w-4"></i>{{ $t('room.copyId') }}</button>
          <button v-if="inLine" type="button" class="text-[#06C755]" @click="pick('share-invite')"><i class="fab fa-line w-4"></i>{{ $t('room.lineInvite') }}</button>
          <button v-else type="button" @click="pick('share-invite')"><i class="fas fa-share-square w-4"></i>{{ $t('share.invite') }}</button>
        </div>
      </div>

      <!-- More: host-only room actions -->
      <div v-if="isHost" class="relative">
        <button type="button" class="hdr-btn" :aria-label="$t('room.more')" @click="toggle('more')">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        <div v-if="open === 'more'" class="hdr-menu">
          <button type="button" class="text-rose-400" @click="pick('close-room')"><i class="fas fa-door-closed w-4"></i>{{ $t('game.closeGame') }}</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="open" class="fixed inset-0 z-30" @click="open = null"></div>
</template>

<script setup>
// Fixed room header (tournament and cash rooms): name, host, the headline
// number (prize pool / pot) and the share + host menus. The app's bottom
// navigation is hidden in rooms, so the ← here goes back to the lobby.
import { ref } from 'vue';

defineProps({
  name: { type: String, default: '' },
  hostName: { type: String, default: '' },
  badge: { type: String, default: '' },
  badgeClass: { type: String, default: 'bg-amber-500/20 text-amber-400' },
  valueLabel: { type: String, default: '' },
  value: { type: String, default: '' },
  subValue: { type: String, default: '' },
  isHost: { type: Boolean, default: false },
  // Running inside LINE: the invite goes out as a LINE card; elsewhere
  // through the system share sheet (useShare)
  inLine: { type: Boolean, default: false },
});
const emit = defineEmits(['copy-id', 'share-invite', 'close-room']);

const open = ref(null);
const toggle = (menu) => { open.value = open.value === menu ? null : menu; };
const pick = (action) => {
  open.value = null;
  emit(action);
};
</script>

<style scoped>
.room-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  max-width: 28rem;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: rgb(var(--tw-slate-800) / 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgb(var(--tw-slate-700));
}
.hdr-btn {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.6rem;
  color: rgb(var(--tw-slate-300));
  background: rgb(var(--tw-slate-700) / 0.6);
}
.hdr-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  z-index: 50;
  min-width: 10rem;
  padding: 0.3rem;
  border-radius: 0.6rem;
  background: rgb(var(--tw-slate-800));
  border: 1px solid rgb(var(--tw-slate-600));
  display: flex;
  flex-direction: column;
}
.hdr-menu button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  text-align: left;
  color: rgb(var(--tw-white));
}
.hdr-menu button:hover { background: rgb(var(--tw-slate-600) / 0.5); }
/* Wider screens: the room widens (max-w-3xl / max-w-5xl) and this follows */
@media (min-width: 768px) { .room-header { max-width: 48rem; } }
@media (min-width: 1024px) { .room-header { max-width: 64rem; } }
</style>
