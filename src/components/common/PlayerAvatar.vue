<template>
  <span
    class="pa"
    :class="[`pa-${sizeKey}`, shownFrame ? `frame-${shownFrame}` : 'frame-none']"
    :title="frameName || undefined"
  >
    <span class="pa-face">
      <img
        v-if="src && !broken"
        :src="src"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="broken = true"
      />
      <span v-else class="pa-initial" aria-hidden="true">{{ initial }}</span>
    </span>
    <!-- Seat linked to an account (the rows' old blue ● next to the name) -->
    <span v-if="linked" class="pa-linked" aria-hidden="true"></span>
  </span>
</template>

<script setup>
// A player's round avatar with their 頭像框 (avatar frame) as the ring.
// Image from `src` (falls back to the name's first character when missing or
// broken). The frame is either given (`frame`: a frame id, or null / '' for
// none) or read from the player's userTitles display through the shared cache
// (`uid`; the same doc TitleBadge loads, so no extra read). No frame → a thin
// neutral ring. Sizes: sm 28px (rows) · md 40px · lg 80px (profile).
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ensureUserTitles, frameOf } from '../../composables/useUserTitles.js';
import { FRAME_IDS } from '../../utils/titles.js';

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: String, default: 'md' },
  uid: { type: String, default: '' },
  // Given frame id (wins over the uid lookup); null / '' = no frame
  frame: { type: String, default: undefined },
  // Small blue dot: the seat belongs to an account
  linked: { type: Boolean, default: false },
});

const { t } = useI18n();

const sizeKey = computed(() => (['sm', 'md', 'lg'].includes(props.size) ? props.size : 'md'));
const given = computed(() => props.frame !== undefined);

watch(() => props.uid, (uid) => {
  if (uid && !given.value) ensureUserTitles(uid);
}, { immediate: true });

const shownFrame = computed(() => {
  const id = given.value ? props.frame : frameOf(props.uid);
  // Unknown ids (a newer catalog than this build) show no frame
  return FRAME_IDS.includes(id) ? id : null;
});
const frameName = computed(() => (shownFrame.value ? t(`titles.frames.${shownFrame.value}`) : ''));

const broken = ref(false);
watch(() => props.src, () => { broken.value = false; });

const initial = computed(() => {
  const first = Array.from(String(props.name || '').trim())[0];
  return first ? first.toUpperCase() : '?';
});
</script>

<style scoped>
/* The ring is the padding of .pa showing its background; .pa-face sits on
   top. Fixed frame hues (like the rarity badges) so a frame reads the same in
   every theme; light themes get deeper tones for contrast. */
.pa {
  --ring: 2px;
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  width: var(--size);
  height: var(--size);
  padding: var(--ring);
  border-radius: 999px;
  background: rgb(var(--tw-slate-600));
  vertical-align: middle;
}
.pa-sm { --size: 28px; }
.pa-md { --size: 40px; }
.pa-lg { --size: 80px; --ring: 3px; }
.pa-sm.frame-none, .pa-md.frame-none { --ring: 1px; }
.pa-lg.frame-none { --ring: 2px; }

.pa-face {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(var(--tw-slate-700));
  color: rgb(var(--tw-slate-200));
  /* a hairline between the ring and the photo */
  box-shadow: 0 0 0 1px rgb(var(--tw-slate-900) / 0.6);
}
.frame-none .pa-face { box-shadow: none; }
.pa-face img { width: 100%; height: 100%; object-fit: cover; }
.pa-initial { font-weight: 700; line-height: 1; user-select: none; }
.pa-sm .pa-initial { font-size: 0.75rem; }
.pa-md .pa-initial { font-size: 1rem; }
.pa-lg .pa-initial { font-size: 2rem; }
.pa-linked {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #60a5fa;
  box-shadow: 0 0 0 2px rgb(var(--tw-slate-800));
}
.pa-lg .pa-linked { width: 14px; height: 14px; right: 3px; bottom: 3px; }

.frame-bronze { background: #c47f45; }
.frame-silver { background: #cbd5e1; }
.frame-gold { background: #f5c542; }
.frame-platinum { background: linear-gradient(135deg, #f1f5f9 0%, #7dd3fc 50%, #e2e8f0 100%); }
.frame-diamond {
  background: conic-gradient(from 210deg, #67e8f9, #a78bfa, #f0abfc, #67e8f9);
  box-shadow: 0 0 4px rgba(167, 139, 250, 0.35);
}

:root[data-mode="light"] .pa-linked { background: #2563eb; }
:root[data-mode="light"] .frame-bronze { background: #a0582a; }
:root[data-mode="light"] .frame-silver { background: #8b97a8; }
:root[data-mode="light"] .frame-gold { background: #c8960c; }
:root[data-mode="light"] .frame-platinum { background: linear-gradient(135deg, #64748b 0%, #0ea5e9 50%, #94a3b8 100%); }
:root[data-mode="light"] .frame-diamond {
  background: conic-gradient(from 210deg, #0891b2, #7c3aed, #c026d3, #0891b2);
  box-shadow: none;
}
</style>
