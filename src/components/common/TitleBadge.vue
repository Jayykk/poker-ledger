<template>
  <span
    v-if="shown"
    class="title-badge"
    :class="rarity"
    :title="`${$t(`titles.rarity.${rarity}`)} · ${name}`"
  >
    <i v-if="shown.tier === 4" class="fas fa-crown title-badge-crown" aria-hidden="true"></i>
    <span class="title-badge-text">{{ name }}</span>
  </span>
</template>

<script setup>
// 稱號 pill next to a player's name. Either give it a `uid` (shows the title
// that player chose to display, loaded through the shared cache) or a
// `familyId` + `tier` (稱號圖鑑 / profile picker). Renders nothing when there
// is no title. Rarity colors: 1 gray · 2 blue · 3 purple · 4 gold + crown.
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ensureUserTitles, titleDisplayOf } from '../../composables/useUserTitles.js';
import { titleRarity, titleTierOf } from '../../utils/titles.js';

const props = defineProps({
  uid: { type: String, default: '' },
  familyId: { type: String, default: '' },
  tier: { type: Number, default: 0 },
});

const { t } = useI18n();

watch(() => props.uid, (uid) => {
  if (uid && !props.familyId) ensureUserTitles(uid);
}, { immediate: true });

const shown = computed(() => {
  const display = props.familyId
    ? { familyId: props.familyId, tier: props.tier }
    : titleDisplayOf(props.uid);
  // Unknown families (a newer catalog than this build) stay hidden
  return display && titleTierOf(display.familyId, display.tier) ? display : null;
});
const rarity = computed(() => titleRarity(shown.value?.tier));
const name = computed(() => (shown.value ? t(titleTierOf(shown.value.familyId, shown.value.tier).nameKey) : ''));
</script>

<style scoped>
/* Fixed hues (not the themed amber / slate) so a rarity reads the same in
   every theme; light themes get darker text for contrast. */
.title-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 8.5rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  border: 1px solid;
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  vertical-align: middle;
}
.title-badge-text { overflow: hidden; text-overflow: ellipsis; }
.title-badge-crown { flex-shrink: 0; font-size: 0.6rem; }

.title-badge.common { color: #cbd5e1; background: rgba(148, 163, 184, 0.14); border-color: rgba(148, 163, 184, 0.4); }
.title-badge.rare { color: #93c5fd; background: rgba(59, 130, 246, 0.16); border-color: rgba(59, 130, 246, 0.5); }
.title-badge.epic { color: #d8b4fe; background: rgba(168, 85, 247, 0.16); border-color: rgba(168, 85, 247, 0.5); }
.title-badge.legendary {
  color: #fde68a;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(217, 119, 6, 0.18));
  border-color: rgba(251, 191, 36, 0.7);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.35);
}

:root[data-mode="light"] .title-badge.common { color: #475569; background: rgba(100, 116, 139, 0.12); }
:root[data-mode="light"] .title-badge.rare { color: #1d4ed8; background: rgba(59, 130, 246, 0.12); }
:root[data-mode="light"] .title-badge.epic { color: #7e22ce; background: rgba(168, 85, 247, 0.12); }
:root[data-mode="light"] .title-badge.legendary { color: #92400e; background: linear-gradient(135deg, rgba(251, 191, 36, 0.35), rgba(245, 158, 11, 0.2)); box-shadow: none; }
</style>
