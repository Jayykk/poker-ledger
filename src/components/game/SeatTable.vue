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

        <!-- On the felt: the room's name (stays upright as it turns) -->
        <text v-if="feltTitle" :x="VIEW.cx" :y="VIEW.cy + 4" text-anchor="middle" class="st-title">{{ feltTitle }}</text>

        <!-- Starting button and blinds, on the felt in front of their seats -->
        <g v-for="m in markers" :key="m.kind" :transform="`translate(${m.x},${m.y})`" :class="`st-mark ${m.kind}`">
          <ellipse :rx="m.kind === 'd' ? 8 : 9.5" ry="6.4" cy="1.5" class="edge" />
          <ellipse :rx="m.kind === 'd' ? 8 : 9.5" ry="6.4" class="top" />
          <text y="3" text-anchor="middle">{{ m.text }}</text>
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
      </div>

      <!-- Names: under their seat, stepping aside so long ones stay whole -->
      <div
        v-for="s in seats"
        :key="`n${s.key}`"
        class="st-name"
        :class="{ me: s.me, out: s.out, empty: !s.player, sel: selected === s.key }"
        :data-seat="s.key"
        :style="{ left: `${s.nameLeft}%`, top: `${s.nameTop}%`, zIndex: s.z + 300 }"
      >{{ s.name }}</div>

      <button v-if="canMyView" type="button" class="st-home mine" @pointerdown.stop @click="easeTo(myTheta)">
        <i class="fas fa-user"></i> {{ $t('seats.myView') }}
      </button>
      <button v-if="turned" type="button" class="st-home" @pointerdown.stop @click="easeTo(0)">
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
//   - it opens with the dealer at the far side — seats are read off the
//     dealer — and 我的視角 turns it to the view from your own seat (you at
//     the near side, neighbours left and right); 回正 goes back
//   - the felt carries the room's name; D / SB / BB discs mark where the
//     first hand starts
//   - seats show the players' own avatars and 頭像框; names sit under them
//     and step aside rather than being cut short
//   - it follows the game: knocked-out players stay greyed out with their
//     place until someone takes the seat; `badgeOf` puts the bounty on a seat
// Geometry lives in utils/seatTableLayout.js.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import PlayerAvatar from '../common/PlayerAvatar.vue';
import TitleBadge from '../common/TitleBadge.vue';
import LiveTitleBadge from '../common/LiveTitleBadge.vue';
import {
  VIEW, TABLE, seatPoint, ovalPath, homeTheta, nearestHome, textWidth, fitText, spreadLabels,
} from '../../utils/seatTableLayout.js';
import { blindPositions } from '../../utils/seatDraw.js';

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
  // On the felt: the room's name
  title: { type: String, default: '' },
});
const { t } = useI18n();

// The felt is at its narrowest when the table is turned sideways
const feltTitle = computed(() => fitText(props.title, TABLE.b * 2 - 34, 6.2, 11));

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

// Rotation about the vertical axis (radians). 0 = the dealer at the far side,
// which is how seats are told apart; myTheta = the view from my own seat.
const theta = ref(0);
const off = (target) => Math.abs(theta.value - nearestHome(theta.value, target)) > 0.02;
const turned = computed(() => off(0));
const myTheta = computed(() => {
  const mine = positions.value.find((p) => isMe(p.player));
  return mine ? homeTheta(mine.index, RING) : null;
});
const canMyView = computed(() => myTheta.value !== null && off(myTheta.value));

const depthRange = TABLE.a + RING;
// Avatars and name pills are CSS-pixel sized while the drawing scales with
// the box, so they're laid out in drawing units at the box's real scale
// (px per unit): on a narrow phone they take up more of the table.
const NAME_H = 19; // px, rendered pill height
const NAME_MAX = 150; // px, .st-name's max-width (9.4rem)
const NAME_MIN = 50; // px, never cut a name shorter than this
const NAME_PAD = 15; // px, its padding + border
const pxPerUnit = ref(1);
const points = computed(() => positions.value.map((p) => seatPoint(p.index, theta.value, RING)));
const nameOf = (p) => (p.player ? p.player.name : t(p.dealer ? 'seats.noDealerSeat' : 'seats.empty'));
const clashes = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
// Name pills start under their avatar and make room for each other. Where
// seats are too crowded for that (long names side by side on a narrow
// phone), the longer of two pills still touching is cut a little and the
// layout runs again — names are only cut when they can't fit whole.
const nameLayout = computed(() => {
  const u = (px) => px / pxPerUnit.value;
  const names = positions.value.map(nameOf);
  const caps = names.map(() => NAME_MAX);
  // Avatars (and the badge hanging under them) stay clear
  const blocks = points.value.map((at) => ({ x: at.x, y: at.y + u(2), w: u(40), h: u(46) }));
  let labels = [];
  let placed = [];
  for (let round = 0; round < 6; round++) {
    labels = names.map((name, i) => ({
      x: points.value[i].x,
      y: points.value[i].y + u(33),
      w: u(Math.min(caps[i], textWidth(name) + NAME_PAD)),
      h: u(NAME_H),
    }));
    placed = spreadLabels(labels, blocks).map((pt, i) => ({ ...labels[i], ...pt }));
    let cut = false;
    const shorten = (k) => {
      const now = placed[k].w * pxPerUnit.value;
      if (now <= NAME_MIN) return;
      caps[k] = Math.max(NAME_MIN, now * 0.8);
      cut = true;
    };
    // (a pill brushing a neighbour's avatar is fine: names draw on top)
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (clashes(placed[i], placed[j])) shorten(placed[i].w >= placed[j].w ? i : j);
      }
    }
    if (!cut) break;
  }
  return placed.map((l, i) => ({
    x: l.x,
    y: l.y,
    text: textWidth(names[i]) + NAME_PAD > caps[i] ? fitText(names[i], caps[i] - NAME_PAD) : names[i],
  }));
});
const seats = computed(() => positions.value.map((p, i) => {
  const at = points.value[i];
  const label = nameLayout.value[i];
  return {
    nameLeft: (label.x / VIEW.w) * 100,
    nameTop: (label.y / VIEW.h) * 100,
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
    name: label.text,
    me: isMe(p.player),
    badge: p.player && !p.out ? props.badgeOf(p.player) || '' : '',
  };
}));

// D / SB / BB discs in front of their seats (where the first hand starts).
// Heads-up the button is also the small blind: the second disc sits further in.
const markers = computed(() => {
  const live = positions.value.filter((p) => p.player && !p.out).map((p) => p.player);
  const at = blindPositions(live);
  const used = new Map();
  return [['d', 'D', at.button], ['sb', 'SB', at.sb], ['bb', 'BB', at.bb]]
    .filter(([, , index]) => index !== null)
    .map(([kind, text, index]) => {
      const n = used.get(index) || 0;
      used.set(index, n + 1);
      const pt = seatPoint(index, theta.value, -18 - n * 17);
      return { kind, text, x: pt.x.toFixed(1), y: pt.y.toFixed(1) };
    });
});

// Tap a seat for its details
const selected = ref(null);
const picked = computed(() => seats.value.find((s) => s.key === selected.value && s.player) || null);

// ── Drag to turn (a press that doesn't move is a tap on a seat) ──
const root = ref(null);
// The box's real scale, kept up to date as it resizes (window, rotation)
let resizeObs = null;
onMounted(() => {
  const measure = () => {
    const w = root.value?.clientWidth || 0;
    if (w > 0) pxPerUnit.value = w / VIEW.w;
  };
  measure();
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    resizeObs = new ResizeObserver(measure);
    resizeObs.observe(root.value);
  }
});
onBeforeUnmount(() => resizeObs?.disconnect());
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

// 回正 (0: dealer at the far side) / 我的視角 (myTheta): ease round to it
function easeTo(base) {
  stopEase();
  const step = () => {
    const target = nearestHome(theta.value, base);
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
onBeforeUnmount(stopEase);
</script>

<style scoped>
.seat-table {
  position: relative;
  border-radius: 0.9rem;
  background: radial-gradient(ellipse at 50% 45%, #3a4236 0%, #2b3029 70%, #262a25 100%);
  border: 1px solid rgb(var(--tw-slate-600) / 0.4);
  overflow: hidden;
  /* its own stacking context: the seats' z-index (depth order) must not
     climb over windows opened above the room */
  isolation: isolate;
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
.st-mark text { font: 900 7.5px system-ui, sans-serif; fill: #1f2937; }
.st-mark.d .top { fill: #f8fafc; }
.st-mark.d .edge { fill: #94a3b8; }
.st-mark.sb .top { fill: #7dd3fc; }
.st-mark.sb .edge { fill: #0369a1; }
.st-mark.bb .top { fill: #fbbf24; }
.st-mark.bb .edge { fill: #b45309; }
.st-fig-shadow { fill: rgb(0 0 0 / 0.3); }
.st-title { font: 800 11px system-ui, sans-serif; fill: rgb(255 255 255 / 0.5); letter-spacing: 0.04em; }

.st-seat {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--s, 1));
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
  position: absolute;
  transform: translate(-50%, -50%);
  max-width: 9.4rem;
  padding: 0 0.4rem;
  border-radius: 0.4rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  background: rgb(15 17 16 / 0.85);
  border: 1px solid rgb(255 255 255 / 0.14);
  cursor: pointer;
}
.st-name.me { color: #fcd34d; border-color: rgb(251 191 36 / 0.6); }
.st-name.sel { border-color: #6ee7b7; }
.st-name.out { color: rgb(255 255 255 / 0.5); text-decoration: line-through; }
.st-name.empty { color: rgb(255 255 255 / 0.4); background: none; border-color: transparent; font-weight: 500; }

.st-home {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1000;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6ee7b7;
  background: rgb(15 17 16 / 0.8);
  border: 1px solid #34d399;
}
.st-home.mine { right: auto; left: 0.5rem; color: #fcd34d; border-color: #fbbf24; }
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
