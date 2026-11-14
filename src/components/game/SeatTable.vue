<template>
  <div>
    <div
      ref="root"
      class="seat-table"
      :class="{ dragging }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
    >
      <svg :viewBox="`0 0 ${VIEW.w} ${VIEW.h}`" class="st-svg" aria-hidden="true">
        <!-- Table: floor shadow, rail side, rail top, felt -->
        <path :d="ovalPath(theta, 12, 16)" class="st-shadow" />
        <path :d="ovalPath(theta, 8, 7)" class="st-side" />
        <path :d="ovalPath(theta, 8)" class="st-rail" />
        <path :d="ovalPath(theta, 0)" class="st-felt" />
        <path :d="ovalPath(theta, -14)" class="st-line" />

        <!-- Starting button, on the felt in front of its seat -->
        <g v-if="buttonAt" :transform="`translate(${buttonAt.x},${buttonAt.y})`">
          <ellipse rx="8" ry="6.4" cy="1.5" class="st-btn-edge" />
          <ellipse rx="8" ry="6.4" class="st-btn" />
          <text y="3.2" text-anchor="middle" class="st-btn-text">D</text>
        </g>

        <!-- Everyone's shadow on the floor -->
        <ellipse v-for="s in seats" :key="s.key" :cx="s.x" :cy="s.y + 21" rx="15" ry="5" class="st-fig-shadow" />
      </svg>

      <!-- Seats: avatar (with its 頭像框), seat number, name, bounty -->
      <div
        v-for="s in seats"
        :key="s.key"
        class="st-seat"
        :class="{ me: s.me, out: s.out, empty: !s.player, dealer: s.dealer, sel: selected === s.key }"
        :data-seat="s.key"
        :style="{ left: `${s.left}%`, top: `${s.top}%`, zIndex: s.z, '--s': s.scale }"
      >
        <div class="st-av">
          <PlayerAvatar
            v-if="s.player"
            size="md"
            :src="avatarOf(s.player)"
            :name="s.player.name"
            :uid="s.player.uid || ''"
            style="--size: 36px"
          />
          <span v-else class="st-chair"><i class="fas fa-chair"></i></span>
          <span class="st-no">{{ s.dealer ? $t('seats.dealerShort') : s.no }}</span>
          <span v-if="s.out && s.player.placement" class="st-place">#{{ s.player.placement }}</span>
          <span v-else-if="s.badge" class="st-badge">{{ s.badge }}</span>
        </div>
        <div class="st-name">{{ s.name }}</div>
      </div>

      <button v-if="turned" type="button" class="st-home" @pointerdown.stop @click="goHome">
        <i class="fas fa-rotate-left"></i> {{ $t('seats.recenter') }}
      </button>
      <div class="st-hint">{{ $t('seats.dragHint') }}</div>
    </div>

    <!-- The seat you tapped -->
    <div v-if="picked" class="st-detail">
      <PlayerAvatar size="sm" :src="avatarOf(picked.player)" :name="picked.player.name" :uid="picked.player.uid || ''" />
      <span class="who">{{ picked.player.name }}</span>
      <LiveTitleBadge v-if="roomTitles[picked.player.id]" :title-id="roomTitles[picked.player.id]" />
      <TitleBadge v-else-if="picked.player.uid" :uid="picked.player.uid" />
      <span class="meta">
        {{ picked.dealer ? $t('seats.dealer') : $t('seats.seatNo', { seat: picked.no }) }}
        <template v-if="picked.out && picked.player.placement"> · #{{ picked.player.placement }}</template>
        <template v-else-if="picked.badge"> · {{ picked.badge }}</template>
      </span>
    </div>
  </div>
</template>

<script setup>
// The table for 抽座位: an oval table seen at an angle with everyone at their
// seat (dealer position + 1..9), turned by dragging left / right.
//   - it opens from your own seat: you're at the near side, so your
//     neighbours are on your left and right (a spectator sees the dealer far)
//   - seats show the players' own avatars and 頭像框
//   - it follows the game: knocked-out players stay greyed out with their
//     place until someone takes the seat; `badgeOf` puts the bounty on a seat
// Geometry lives in utils/seatTableLayout.js.
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import PlayerAvatar from '../common/PlayerAvatar.vue';
import TitleBadge from '../common/TitleBadge.vue';
import LiveTitleBadge from '../common/LiveTitleBadge.vue';
import { VIEW, TABLE, seatPoint, ovalPath, homeTheta, nearestHome } from '../../utils/seatTableLayout.js';

const props = defineProps({
  // liveSeatingChart(players): { dealer, dealerOut, seats: [{ no, player, out }] }
  chart: { type: Object, required: true },
  myUid: { type: String, default: '' },
  // (player) => avatar image url ('' → PlayerAvatar's own fallbacks)
  avatarOf: { type: Function, default: () => '' },
  // (player) => short text on the seat of a player still in (e.g. their bounty)
  badgeOf: { type: Function, default: () => '' },
  // 房內即時稱號: playerId → title id
  roomTitles: { type: Object, default: () => ({}) },
});
const { t } = useI18n();

// Position 0 is the dealer, 1..9 the numbered seats; `out` = the knocked-out
// player who last held a seat nobody took since
const positions = computed(() => [
  {
    index: 0, no: '', dealer: true,
    player: props.chart.dealer || props.chart.dealerOut || null,
    out: !props.chart.dealer && !!props.chart.dealerOut,
  },
  ...(props.chart.seats || []).map((s) => ({
    index: s.no, no: s.no, dealer: false, player: s.player || s.out || null, out: !s.player && !!s.out,
  })),
]);
const RING = 40; // seats sit this far out from the table edge
const isMe = (p) => !!p?.uid && p.uid === props.myUid;

// Rotation about the vertical axis (radians). Home = the view from my seat.
const home = computed(() => {
  const mine = positions.value.find((p) => isMe(p.player));
  return homeTheta(mine ? mine.index : null, RING);
});
const theta = ref(home.value);
const turned = computed(() => Math.abs(theta.value - nearestHome(theta.value, home.value)) > 0.02);

const depthRange = TABLE.a + RING;
const seats = computed(() => positions.value.map((p) => {
  const at = seatPoint(p.index, theta.value, RING);
  const name = p.player ? p.player.name : t(p.dealer ? 'seats.noDealerSeat' : 'seats.empty');
  return {
    key: p.index,
    x: at.x,
    y: at.y,
    left: (at.x / VIEW.w) * 100,
    top: (at.y / VIEW.h) * 100,
    z: 200 + Math.round(at.depth),
    // a touch bigger towards the viewer
    scale: (1 + 0.08 * (at.depth / depthRange)).toFixed(3),
    no: p.no,
    dealer: p.dealer,
    player: p.player,
    out: p.out,
    name,
    me: isMe(p.player),
    badge: p.player && !p.out ? props.badgeOf(p.player) || '' : '',
  };
}));

const buttonAt = computed(() => {
  const holder = positions.value.find((p) => !p.out && p.player?.seat?.button);
  if (!holder) return null;
  const at = seatPoint(holder.index, theta.value, -18);
  return { x: at.x.toFixed(1), y: at.y.toFixed(1) };
});

// Tap a seat for its details
const selected = ref(null);
const picked = computed(() => seats.value.find((s) => s.key === selected.value && s.player) || null);

// ── Drag to turn (a press that doesn't move is a tap on a seat) ──
const root = ref(null);
const dragging = ref(false);
let lastX = 0;
let travelled = 0;
let downSeat = null;
let raf = 0;
const stopEase = () => { cancelAnimationFrame(raf); raf = 0; };

function onDown(e) {
  stopEase();
  dragging.value = true;
  lastX = e.clientX;
  travelled = 0;
  const el = e.target.closest?.('[data-seat]');
  downSeat = el ? Number(el.dataset.seat) : null;
  root.value?.setPointerCapture?.(e.pointerId);
}
function onMove(e) {
  if (!dragging.value) return;
  const dx = e.clientX - lastX;
  travelled += Math.abs(dx);
  // Dragging right carries the near side of the table to the right
  theta.value -= dx * 0.011;
  lastX = e.clientX;
}
function onUp() {
  if (dragging.value && travelled < 6) {
    selected.value = downSeat === null || downSeat === selected.value ? null : downSeat;
  }
  dragging.value = false;
}
function onCancel() {
  dragging.value = false;
}

// 回正: ease back to the view from my seat
function goHome() {
  stopEase();
  const step = () => {
    const target = nearestHome(theta.value, home.value);
    const diff = target - theta.value;
    if (Math.abs(diff) < 0.004) {
      theta.value = target;
      raf = 0;
      return;
    }
    theta.value += diff * 0.2;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// My seat changed (a redraw, a re-entry elsewhere): look from the new one
watch(home, (h) => {
  stopEase();
  theta.value = h;
});
onBeforeUnmount(stopEase);
</script>

<style scoped>
.seat-table {
  position: relative;
  border-radius: 0.9rem;
  background: radial-gradient(ellipse at 50% 45%, #3a4236 0%, #2b3029 70%, #262a25 100%);
  border: 1px solid rgb(var(--tw-slate-600) / 0.4);
  overflow: hidden;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.seat-table.dragging { cursor: grabbing; }
.st-svg { display: block; width: 100%; height: auto; }

.st-shadow { fill: rgb(0 0 0 / 0.28); }
.st-side { fill: #25301f; }
.st-rail { fill: #4a5a3c; }
.st-felt { fill: #4f9a63; }
.st-line { fill: none; stroke: rgb(255 255 255 / 0.16); stroke-width: 1; }
.st-btn { fill: #f8fafc; }
.st-btn-edge { fill: #94a3b8; }
.st-btn-text { font: 900 8px system-ui, sans-serif; fill: #1f2937; }
.st-fig-shadow { fill: rgb(0 0 0 / 0.3); }

.st-seat {
  position: absolute;
  width: 4.4rem;
  transform: translate(-50%, -50%) scale(var(--s, 1));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  cursor: pointer;
}
.st-av { position: relative; display: inline-flex; border-radius: 999px; }
.st-seat.me .st-av { box-shadow: 0 0 0 2px #fbbf24, 0 0 10px rgb(251 191 36 / 0.55); }
.st-seat.sel .st-av { box-shadow: 0 0 0 2px #6ee7b7; }
.st-seat.out .st-av :deep(.pa) { filter: grayscale(1); opacity: 0.45; }

.st-chair {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: rgb(255 255 255 / 0.3);
  border: 1px dashed rgb(255 255 255 / 0.3);
  background: rgb(0 0 0 / 0.18);
}
.st-no {
  position: absolute;
  top: -4px;
  left: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: #111827;
  border: 1px solid rgb(255 255 255 / 0.35);
}
.st-seat.dealer .st-no { color: #111827; background: #f1f5f9; border-color: #fff; }
.st-seat.empty .st-no { color: rgb(255 255 255 / 0.6); background: rgb(17 24 39 / 0.6); border-style: dashed; }

.st-badge, .st-place {
  position: absolute;
  left: 50%;
  bottom: -7px;
  transform: translateX(-50%);
  padding: 0 0.3rem;
  border-radius: 999px;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1.45;
  white-space: nowrap;
}
.st-badge { color: #1c1917; background: #fbbf24; box-shadow: 0 1px 3px rgb(0 0 0 / 0.5); }
.st-place { color: #e2e8f0; background: #475569; }
.st-av:has(.st-badge), .st-av:has(.st-place) { margin-bottom: 5px; }

.st-name {
  max-width: 100%;
  padding: 0 0.35rem;
  border-radius: 0.4rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  background: rgb(15 17 16 / 0.82);
}
.st-seat.me .st-name { color: #fcd34d; }
.st-seat.out .st-name { color: rgb(255 255 255 / 0.5); text-decoration: line-through; }
.st-seat.empty .st-name { color: rgb(255 255 255 / 0.4); background: none; font-weight: 500; }

.st-home {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 500;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6ee7b7;
  background: rgb(15 17 16 / 0.8);
  border: 1px solid #34d399;
}
.st-hint {
  position: absolute;
  right: 0.6rem;
  bottom: 0.3rem;
  font-size: 0.66rem;
  color: rgb(255 255 255 / 0.4);
  pointer-events: none;
}

.st-detail {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.7rem;
  background: rgb(var(--tw-slate-800) / 0.7);
  border: 1px solid rgb(var(--tw-slate-600) / 0.5);
}
.st-detail .who { font-weight: 700; color: rgb(var(--tw-white)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.st-detail .meta { margin-left: auto; font-size: 0.75rem; color: rgb(var(--tw-white) / 0.6); white-space: nowrap; }
</style>
