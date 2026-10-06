<template>
  <span
    v-if="known"
    class="live-badge"
    :data-title="titleId"
    :title="`${$t('titles.room.live')} · ${$t(`titles.room.desc.${titleId}`)}`"
  >
    <i class="fas live-badge-icon" :class="ICONS[titleId]" aria-hidden="true"></i>
    <span class="live-badge-text">{{ $t(`titles.room.names.${titleId}`) }}</span>
  </span>
</template>

<script setup>
// 房內即時稱號 pill (utils/roomTitles.js): coral, with an icon per title.
// Rooms show it in place of the player's regular TitleBadge while it lasts.
import { computed } from 'vue';
import { ROOM_TITLE_IDS } from '../../utils/roomTitles.js';

const props = defineProps({
  titleId: { type: String, default: '' },
});

const ICONS = Object.freeze({
  hunter: 'fa-crosshairs',
  chipLeader: 'fa-coins',
  phoenix: 'fa-fire',
  patron: 'fa-sack-dollar',
  prey: 'fa-bullseye',
  firstBlood: 'fa-droplet',
});

const known = computed(() => ROOM_TITLE_IDS.includes(props.titleId));
</script>

<style scoped>
/* Same shape as TitleBadge, a coral tint none of the rarities use */
.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 8.5rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 127, 80, 0.6);
  background: rgba(255, 127, 80, 0.16);
  color: #ffb08a;
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  vertical-align: middle;
}
.live-badge-text { overflow: hidden; text-overflow: ellipsis; }
.live-badge-icon { flex-shrink: 0; font-size: 0.6rem; }

:root[data-mode="light"] .live-badge { color: #c2410c; background: rgba(255, 127, 80, 0.14); border-color: rgba(234, 88, 12, 0.55); }
</style>
