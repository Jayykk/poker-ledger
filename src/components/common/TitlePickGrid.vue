<template>
  <div class="title-pick-grid">
    <template v-for="item in cells" :key="item.familyId">
      <button
        type="button"
        class="title-pick"
        :class="{ active: item.picked, crown: item.crown, open: openId === item.familyId }"
        :disabled="disabled"
        :aria-expanded="item.steps ? openId === item.familyId : undefined"
        @click="tapFamily(item)"
      >
        <TitleBadge :family-id="item.familyId" :tier="item.shownTier" :name-set="nameSet" />
        <span class="title-pick-sub">{{ $t(`titles.families.${item.familyId}.desc`) }}</span>
        <i v-if="item.picked" class="fas fa-check title-pick-check" aria-hidden="true"></i>
        <i v-if="item.steps" class="fas fa-chevron-down title-pick-more" aria-hidden="true"></i>
      </button>
      <!-- Every reached step of the open family, highest first: a full-width
           row under that cell's grid row (grid-auto-flow: dense pulls the
           cells after it back up into the row) -->
      <div v-if="openId === item.familyId" class="title-tier-strip">
        <button
          v-for="tier in item.steps"
          :key="tier"
          type="button"
          class="title-tier"
          :class="{ active: item.picked && tier === item.shownTier }"
          :disabled="disabled"
          :aria-label="$t('titles.stepsOf', { n: tier, total: TITLE_TIER_COUNT })"
          @click="pickTier(item, tier)"
        >
          <TitleBadge :family-id="item.familyId" :tier="tier" :name-set="nameSet" />
          <i v-if="item.picked && tier === item.shownTier" class="fas fa-check title-tier-check" aria-hidden="true"></i>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
// 我的 › 稱號 › 指定: one cell per family (held crowns first, as given). A
// family with more than one step reached opens a strip of those steps to pick
// from; a crown or a family on its first step is picked on tap. Emits
// `pick` with { titleId, titleTier } (titleTier null = the family's highest,
// so it keeps following new tiers).
import { computed, ref, watch } from 'vue';
import TitleBadge from './TitleBadge.vue';
import { TITLE_TIER_COUNT, isCrownId, pickedTitleTier } from '../../utils/titles.js';

const props = defineProps({
  // [{ familyId, tier }]: tier = the highest reached (a crown: its one step)
  items: { type: Array, default: () => [] },
  // prefs.titleId / prefs.titleTier
  pickedId: { type: String, default: null },
  pickedTier: { type: Number, default: null },
  // prefs.nameSet: the names the cells and steps show in
  nameSet: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['pick']);

// The family whose steps are open (one at a time)
const openId = ref(null);

const cells = computed(() => props.items.map((item) => {
  const crown = isCrownId(item.familyId);
  const picked = item.familyId === props.pickedId;
  return {
    familyId: item.familyId,
    tier: item.tier,
    crown,
    picked,
    // The picked family shows the picked step, the others their highest
    shownTier: picked && !crown ? pickedTitleTier(item.tier, props.pickedTier) : item.tier,
    // Steps to choose from, highest first (none: picked on tap)
    steps: !crown && item.tier > 1
      ? Array.from({ length: item.tier }, (_, i) => item.tier - i)
      : null,
  };
}));

// A family that left the list takes its open strip with it
watch(cells, (list) => {
  if (openId.value && !list.some((item) => item.familyId === openId.value && item.steps)) openId.value = null;
});

function tapFamily(item) {
  if (item.steps) {
    openId.value = openId.value === item.familyId ? null : item.familyId;
    return;
  }
  openId.value = null;
  if (!item.picked) emit('pick', { titleId: item.familyId, titleTier: null });
}

function pickTier(item, tier) {
  openId.value = null;
  // The top step is stored as null: it keeps showing the highest as it grows
  const titleTier = tier === item.tier ? null : tier;
  // Skip only when nothing would change. Comparing with the shown step isn't
  // enough: a pick clamped by a lowered tier shows the top step while a higher
  // number is still saved, and tapping it must reset that to null.
  if (item.picked && titleTier === (props.pickedTier ?? null)) return;
  emit('pick', { titleId: item.familyId, titleTier });
}
</script>

<style scoped>
/* Equal cells (badge + its series) so a long name or the legendary glow stays
   inside its box. dense: an open strip takes the next row and the cells after
   it fill the row it was opened from. */
.title-pick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-flow: row dense;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
@media (min-width: 768px) { .title-pick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.title-pick {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.55rem 1.5rem 0.5rem 0.6rem;
  border-radius: 0.6rem;
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-900) / 0.5);
  text-align: left;
  overflow: hidden;
}
.title-pick > .title-badge { max-width: 100%; }
.title-pick-sub {
  max-width: 100%;
  font-size: 0.68rem;
  color: rgb(var(--tw-slate-400));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title-pick-check { position: absolute; top: 0.55rem; right: 0.55rem; font-size: 0.7rem; color: rgb(var(--tw-amber-400)); }
/* More than one step: a small chevron, turned while its strip is open */
.title-pick-more {
  position: absolute;
  bottom: 0.55rem;
  right: 0.55rem;
  font-size: 0.6rem;
  color: rgb(var(--tw-slate-400));
  transition: transform 0.2s;
}
.title-pick.open .title-pick-more { transform: rotate(180deg); }
.title-pick.open:not(.active) { border-color: rgb(var(--tw-slate-400)); }
.title-pick.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.1); }
/* A crown held this month: gold edge until picked */
.title-pick.crown:not(.active) { border-color: rgb(var(--tw-amber-500) / 0.45); }
/* The open family's steps: full width under its row, badges wrap */
.title-tier-strip {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.5rem;
  border-radius: 0.6rem;
  border: 1px solid rgb(var(--tw-slate-700));
  background: rgb(var(--tw-slate-900) / 0.35);
}
.title-tier {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 100%;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
}
.title-tier > .title-badge { max-width: 100%; }
.title-tier.active { border-color: rgb(var(--tw-amber-500)); background: rgb(var(--tw-amber-500) / 0.1); }
.title-tier-check { flex-shrink: 0; font-size: 0.65rem; color: rgb(var(--tw-amber-400)); }
</style>
