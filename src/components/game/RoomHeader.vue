<template>
  <div class="room-header">
    <div class="min-w-0">
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
          <button v-if="canShareLine" type="button" class="text-[#06C755]" @click="pick('share-line')"><i class="fab fa-line w-4"></i>{{ $t('room.lineInvite') }}</button>
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
// number (prize pool / pot) and the share + host menus.
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
  canShareLine: { type: Boolean, default: false },
});
const emit = defineEmits(['copy-id', 'share-line', 'close-room']);

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
  background: rgba(30, 41, 59, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #334155;
}
.hdr-btn {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.6rem;
  color: #cbd5e1;
  background: rgba(51, 65, 85, 0.6);
}
.hdr-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  z-index: 50;
  min-width: 10rem;
  padding: 0.3rem;
  border-radius: 0.6rem;
  background: #1e293b;
  border: 1px solid #475569;
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
  color: #fff;
}
.hdr-menu button:hover { background: rgba(71, 85, 105, 0.5); }
</style>
