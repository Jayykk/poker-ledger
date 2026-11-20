<template>
  <span
    ref="rootEl"
    class="pa"
    :class="[`pa-${sizeKey}`, shownFrame ? `pa-framed frame-${shownFrame}` : 'frame-none']"
    :title="frameName || undefined"
  >
    <span class="pa-face">
      <img
        v-if="shownSrc && !broken"
        :src="shownSrc"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="broken = true"
      />
      <span v-else class="pa-initial" aria-hidden="true">{{ initial }}</span>
    </span>
    <!-- 頭像框: drawn on a canvas larger than the avatar and centred on it, so
         the effects reach outside without taking space (utils/frameFx.js) -->
    <canvas v-if="shownFrame" ref="fxCanvas" class="pa-fx" aria-hidden="true"></canvas>
    <!-- 本月王座: a small crown on the corner, whatever title shows by the name -->
    <span v-if="showCrown" class="pa-crown" :title="$t('titles.throne.title')">
      <i class="fas fa-crown" aria-hidden="true"></i>
    </span>
    <!-- Seat linked to an account (the rows' old blue ● next to the name) -->
    <span v-if="linked" class="pa-linked" aria-hidden="true"></span>
  </span>
</template>

<script setup>
// A player's round avatar with their 頭像框 (avatar frame) around it.
// Image from `src`, else the player's LINE photo from the same cached
// userTitles doc (`uid`), else the name's first character (also when broken).
// The frame is either given (`frame`: a frame id, or null / '' for none) or
// read from the player's userTitles display through the shared cache (`uid`;
// the same doc TitleBadge loads, so no extra read). Sizes: sm 28px (rows) ·
// md 40px · lg 80px (profile).
// A frame is animated on a canvas over the avatar (utils/frameFx.js): one
// draw function per frame id, tier frames and themed ones alike. The canvas
// is absolute and ignores the pointer, so rows keep their height. No frame,
// or an id this build can't draw (a newer catalog) → no canvas, a thin
// neutral ring. `still` shows the frame as one static picture (a locked
// frame in the picker); 簡化特效 does the same for every frame (handled in
// frameFx).
// A small crown sits on the corner while the player wears a 本月王座 (given
// as `crown`, or read through `uid` like the frame).
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { avatarOf, ensureUserTitles, frameOf, wearsCrown } from '../../composables/useUserTitles.js';
import { ALL_FRAME_IDS } from '../../utils/titles.js';
import { hasFrameFx, mountFrame } from '../../utils/frameFx.js';

const SIZE_PX = { sm: 28, md: 40, lg: 80 };

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: String, default: 'md' },
  uid: { type: String, default: '' },
  // Given frame id (wins over the uid lookup); null / '' = no frame
  frame: { type: String, default: undefined },
  // Small blue dot: the seat belongs to an account
  linked: { type: Boolean, default: false },
  // Given corner crown (wins over the uid lookup)
  crown: { type: Boolean, default: undefined },
  // The frame as one static picture, never animated
  still: { type: Boolean, default: false },
});

const { t } = useI18n();

const sizeKey = computed(() => (['sm', 'md', 'lg'].includes(props.size) ? props.size : 'md'));
const given = computed(() => props.frame !== undefined);

watch(() => props.uid, (uid) => {
  if (uid) ensureUserTitles(uid);
}, { immediate: true });

const shownSrc = computed(() => props.src || avatarOf(props.uid));
const showCrown = computed(() => (props.crown !== undefined ? props.crown : wearsCrown(props.uid)));

const shownFrame = computed(() => {
  const id = given.value ? props.frame : frameOf(props.uid);
  // Unknown ids (a newer catalog than this build) show no frame
  return ALL_FRAME_IDS.includes(id) && hasFrameFx(id) ? id : null;
});

// The frame's canvas: (re)mounted when the frame, the size or `still` changes
const rootEl = ref(null);
const fxCanvas = ref(null);
let fx = null;
const unmountFx = () => {
  fx?.destroy();
  fx = null;
};
watch([fxCanvas, shownFrame, sizeKey, () => props.still], ([canvas, frame, size, still]) => {
  unmountFx();
  if (!canvas || !frame) return;
  // The box may be resized from outside (--size on the seat table)
  fx = mountFrame(canvas, frame, rootEl.value?.offsetWidth || SIZE_PX[size], { still });
}, { flush: 'post', immediate: true });
onBeforeUnmount(unmountFx);
const frameName = computed(() => (shownFrame.value ? t(`titles.frames.${shownFrame.value}`) : ''));

const broken = ref(false);
watch(shownSrc, () => { broken.value = false; });

const initial = computed(() => {
  const first = Array.from(String(props.name || '').trim())[0];
  return first ? first.toUpperCase() : '?';
});
</script>

<style scoped>
/* Without a frame: a thin neutral ring, the padding of .pa showing its
   background. With one the photo fills the box and the canvas draws the ring
   and everything around it, in fixed hues (like the rarity badges) so a frame
   reads the same in every theme. */
.pa {
  --ring: 2px;
  position: relative;
  /* the canvas and the corner marks stack inside the avatar only */
  isolation: isolate;
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
.pa-framed { padding: 0; background: transparent; }
/* FRAME_CANVAS_SCALE (2.1) times the avatar, centred; over the photo (its
   middle is punched out) and under the corner crown and the account dot */
.pa-fx {
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 50%;
  width: 210%;
  height: 210%;
  max-width: none;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.pa-face img { width: 100%; height: 100%; object-fit: cover; }
.pa-initial { font-weight: 700; line-height: 1; user-select: none; }
.pa-sm .pa-initial { font-size: 0.75rem; }
.pa-md .pa-initial { font-size: 1rem; }
.pa-lg .pa-initial { font-size: 2rem; }
.pa-linked {
  position: absolute;
  z-index: 2;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #60a5fa;
  box-shadow: 0 0 0 2px rgb(var(--tw-slate-800));
}
.pa-lg .pa-linked { width: 14px; height: 14px; right: 3px; bottom: 3px; }
.pa-crown {
  position: absolute;
  z-index: 2;
  top: -5px;
  right: -5px;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 8px;
  color: #f5c542;
  background: rgb(var(--tw-slate-900));
  box-shadow: 0 0 0 1px rgba(224, 160, 48, 0.9);
}
.pa-md .pa-crown { width: 18px; height: 18px; font-size: 10px; }
.pa-lg .pa-crown { width: 26px; height: 26px; font-size: 13px; top: -2px; right: -2px; }


:root[data-mode="light"] .pa-linked { background: #2563eb; }
:root[data-mode="light"] .pa-crown { color: #b45309; background: #fff; box-shadow: 0 0 0 1px #d97706; }
</style>
