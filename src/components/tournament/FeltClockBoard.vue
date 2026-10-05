<template>
  <div class="felt-board" :class="{ 'is-break': isBreak }">
    <!-- Header: name + format, live status, host actions -->
    <header class="fb-top">
      <div class="fb-actions">
        <slot name="actions-left" />
      </div>
      <div class="fb-title">
        <h1 class="fb-name">{{ name }}</h1>
        <div class="fb-sub">{{ subtitle }}</div>
      </div>
      <div class="fb-side">
        <div class="fb-pills">
          <span class="pill" :class="statusClass"><span class="dot"></span>{{ statusText }}</span>
          <span v-if="cutoffLevel > 0 || isTimed" class="pill" :class="{ closed: buyInClosed }">
            {{ buyInText }}
          </span>
          <span v-if="bountyPerHead > 0" class="pill ko">{{ bountyLabel }} ${{ fmt(bountyPerHead) }}</span>
        </div>
        <div class="fb-actions">
          <slot name="actions-right" />
        </div>
      </div>
    </header>

    <main class="fb-main">
      <!-- Left rail: table stats -->
      <aside class="fb-rail">
        <div v-for="s in leftStats" :key="s.k" class="stat">
          <span class="k">{{ s.k }}</span>
          <span class="v">{{ s.v }}<small v-if="s.s">{{ s.s }}</small></span>
        </div>
      </aside>

      <!-- Center: level, blinds, timer -->
      <section class="fb-center">
        <div class="lvl">{{ levelLabel }}</div>
        <div v-if="isBreak" class="break-title">{{ t('clockFace.breakTitle') }}</div>
        <div v-else class="blinds" :class="{ flash }">
          <div><span class="k">{{ t('clockFace.small') }}</span><span class="v">{{ fmt(currentBlinds.small) }}</span></div>
          <div><span class="k">{{ t('clockFace.big') }}</span><span class="v">{{ fmt(currentBlinds.big) }}</span></div>
          <div class="ante"><span class="k">{{ t('clockFace.ante') }}</span><span class="v">{{ currentBlinds.ante ? fmt(currentBlinds.ante) : '—' }}</span></div>
        </div>
        <div class="timer" :class="timerClass">{{ formattedTime }}</div>
        <div class="drain" aria-hidden="true"><i :style="{ width: `${levelProgress * 100}%` }"></i></div>
        <div class="next">
          <template v-if="status === 'ended'">{{ t('clockFace.gameOver') }}</template>
          <template v-else-if="nextPlayLevelEntry">
            {{ t('clockFace.next') }}
            <b>{{ fmt(nextPlayLevelEntry.small) }} / {{ fmt(nextPlayLevelEntry.big) }}<template v-if="nextPlayLevelEntry.ante"> · {{ fmt(nextPlayLevelEntry.ante) }}</template></b>
          </template>
          <template v-else>{{ isTimed ? t('clockFace.finalLevel') : t('clockFace.finalRepeats') }}</template>
        </div>
      </section>

      <!-- Right rail: when it ends (timed) / what's at stake (tournament) -->
      <aside class="fb-rail right">
        <template v-if="isTimed">
          <div class="stat big">
            <span class="k">{{ t('clockFace.endsIn') }}</span>
            <span class="v">{{ status === 'ended' ? '00:00' : (timeToEnd || '—') }}</span>
          </div>
          <div class="stat"><span class="k">{{ t('clockFace.breakIn') }}</span><span class="v">{{ timeToBreak || '—' }}</span></div>
          <div class="stat"><span class="k">{{ t('clockFace.endsAt') }}</span><span class="v">{{ endsAt || '—' }}</span></div>
        </template>
        <template v-else>
          <div class="stat big"><span class="k">{{ t('clockFace.prizePool') }}</span><span class="v">${{ fmt(prizePool) }}</span></div>
          <div v-if="payouts.length" class="stat">
            <span class="k">{{ t('clockFace.payouts') }}</span>
            <div class="payouts">
              <div v-for="p in payouts.slice(0, 5)" :key="p.place"><span>{{ p.place }}</span><span>${{ fmt(p.amount) }}</span></div>
            </div>
          </div>
          <div class="stat"><span class="k">{{ t('clockFace.breakIn') }}</span><span class="v">{{ timeToBreak || '—' }}</span></div>
        </template>
      </aside>
    </main>

    <!-- The whole schedule to scale: each segment's width is its duration -->
    <footer v-if="segments.length" class="fb-strip">
      <div class="strip-head">
        <span>{{ t('clockFace.structure') }}</span>
        <span>{{ isTimed ? (endsAt ? `${t('clockFace.endsAt')} ${endsAt}` : '') : t('clockFace.finalRepeats') }}</span>
      </div>
      <div class="segs">
        <div
          v-for="seg in segments"
          :key="seg.i"
          class="sg"
          :class="{ brk: seg.brk, done: seg.done, cur: seg.cur }"
          :style="{ '--w': seg.w, '--p': seg.cur ? `${(1 - levelProgress) * 100}%` : '0%' }"
        >
          <i></i><b>{{ seg.brk ? t('clockFace.brk') : seg.level }}</b>
        </div>
        <div v-if="cutoffX != null" class="mark" :style="{ '--x': `${cutoffX}%` }">
          <span>{{ isTimed ? t('clockFace.cutoffMark') : t('clockFace.reentryMark') }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
// Style 2 ("felt") clock face: table felt with a brass rail, blinds split
// into Small / Big / Ante, and a to-scale strip of the whole structure.
// Pure presentation — every value comes from useTournamentClock.
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from './dealerClockFormat.js';
import { levelDurationSeconds, effectiveLevelAt } from '../../utils/timedStructure.js';

const props = defineProps({
  name: { type: String, default: '' },
  customSubtitle: { type: String, default: '' },
  isTimed: { type: Boolean, default: false },
  status: { type: String, default: 'waiting' },
  buyInClosed: { type: Boolean, default: false },
  cutoffLevel: { type: Number, default: 0 },
  // KO games: head value per entry (0 = no bounty)
  bountyPerHead: { type: Number, default: 0 },
  // 'KO' / 'PKO'
  bountyLabel: { type: String, default: '🎯 KO' },
  levels: { type: Array, default: () => [] },
  currentLevelIndex: { type: Number, default: 0 },
  currentLevel: { type: Number, default: 0 },
  currentBlinds: { type: Object, default: () => ({ small: 0, big: 0, ante: 0 }) },
  isBreak: { type: Boolean, default: false },
  nextPlayLevelEntry: { type: Object, default: null },
  formattedTime: { type: String, default: '00:00' },
  localTimeLeft: { type: Number, default: 0 },
  levelProgress: { type: Number, default: 0 },
  timeToBreak: { type: String, default: '' },
  timeToEnd: { type: String, default: '' },
  endsAt: { type: String, default: '' },
  playersRegistered: { type: Number, default: 0 },
  playersRemaining: { type: Number, default: 0 },
  entries: { type: Number, default: 0 },
  chipsInPlay: { type: Number, default: 0 },
  averageStack: { type: Number, default: 0 },
  averageStackBB: { type: Number, default: 0 },
  prizePool: { type: Number, default: 0 },
  payouts: { type: Array, default: () => [] },
});

const { t } = useI18n();
const fmt = (n) => formatNumber(Math.round(Number(n) || 0));

const subtitle = computed(() => {
  if (props.isTimed) {
    return props.cutoffLevel > 0
      ? `${t('clockFace.timedSub')} · ${t('clockFace.cutoffSub', { level: props.cutoffLevel })}`
      : t('clockFace.timedSub');
  }
  if (props.customSubtitle) return props.customSubtitle;
  return props.cutoffLevel > 0 ? t('clockFace.reentrySub', { level: props.cutoffLevel }) : '';
});

const statusText = computed(() => {
  if (props.status === 'ended') return props.isTimed ? t('clockFace.timeUp') : t('clockFace.ended');
  if (props.status === 'running') return t('clockFace.running');
  if (props.status === 'paused') return t('clockFace.paused');
  return t('clockFace.waiting');
});
const statusClass = computed(() => ({
  live: props.status === 'running',
  paused: props.status === 'paused' || props.status === 'waiting',
  over: props.status === 'ended',
}));
const buyInText = computed(() => {
  if (props.isTimed) return props.buyInClosed ? t('clockFace.buyInClosed') : t('clockFace.buyInOpen');
  return props.buyInClosed ? t('clockFace.regClosed') : t('clockFace.regOpen');
});

const levelLabel = computed(() => (props.isBreak
  ? t('clockFace.afterLevel', { level: effectiveLevelAt(props.levels, props.currentLevelIndex) })
  : t('clockFace.level', { level: props.currentLevel })));

const leftStats = computed(() => {
  const avg = { k: t('clockFace.avgStack'), v: fmt(props.averageStack), s: props.averageStackBB ? `${props.averageStackBB} BB` : '' };
  const chips = { k: t('clockFace.chipsInPlay'), v: fmt(props.chipsInPlay) };
  if (props.isTimed) {
    return [
      { k: t('clockFace.players'), v: fmt(props.playersRegistered) },
      { k: t('clockFace.buyIns'), v: fmt(props.entries) },
      chips,
      avg,
    ];
  }
  return [
    { k: t('clockFace.entries'), v: fmt(props.entries) },
    { k: t('clockFace.playersLeft'), v: `${fmt(props.playersRemaining)}/${fmt(props.playersRegistered)}` },
    chips,
    avg,
  ];
});

const timerClass = computed(() => {
  if (props.status === 'ended') return 'done';
  if (props.status !== 'running' || props.isBreak) return '';
  if (props.localTimeLeft <= 10) return 'critical';
  if (props.localTimeLeft <= 60) return 'warn';
  return '';
});

// Structure strip
const durations = computed(() => props.levels.map((_, i) => levelDurationSeconds(props.levels, i)));
const totalDuration = computed(() => durations.value.reduce((a, b) => a + b, 0));
const segments = computed(() => props.levels.map((l, i) => ({
  i,
  brk: !!l.isBreak,
  level: l.level,
  w: durations.value[i],
  done: props.status === 'ended' || i < props.currentLevelIndex,
  cur: props.status !== 'ended' && i === props.currentLevelIndex,
})));
const cutoffX = computed(() => {
  if (!(props.cutoffLevel > 0) || !totalDuration.value) return null;
  const idx = props.levels.findIndex((l) => !l.isBreak && l.level === props.cutoffLevel);
  if (idx < 0) return null;
  const before = durations.value.slice(0, idx).reduce((a, b) => a + b, 0);
  return (before / totalDuration.value) * 100;
});

// Brief brass glow on the blinds when the level changes
const flash = ref(false);
watch(() => props.currentLevelIndex, async (v, old) => {
  if (old === undefined || v === old) return;
  flash.value = false;
  await nextTick();
  flash.value = true;
});

// Display faces load only when this style is used.
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap';
onMounted(() => {
  if (document.querySelector('link[data-felt-clock-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.dataset.feltClockFonts = '1';
  document.head.appendChild(link);
});
</script>

<style scoped>
.felt-board {
  --felt-hi: #1d5a45;
  --felt: #123d30;
  --felt-lo: #0a2119;
  --brass: #cfae6a;
  --brass-dim: #8a7446;
  --ivory: #f3ecdd;
  --ivory-dim: #b9b3a3;
  --chip-red: #e0564a;
  --ok: #7fc59b;
  --f-display: "Big Shoulders Display", "Barlow Semi Condensed", "Arial Narrow", sans-serif;
  --f-label: "Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif;

  container-type: size;
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  color: var(--ivory);
  background: radial-gradient(120% 90% at 50% 38%, var(--felt-hi) 0%, var(--felt) 45%, var(--felt-lo) 100%);
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.felt-board.is-break { --felt-hi: #245246; --felt: #173d36; }

/* Scale unit: fits both a 16:9 TV and a squarer tablet */
.fb-top, .fb-main, .fb-strip { --u: min(1cqw, 1.75cqh); }

.felt-board::after {
  /* table rail: brass hairline + inset second line */
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--brass-dim), inset 0 0 0 7px var(--felt-lo), inset 0 0 0 8px rgba(207, 174, 106, 0.35);
}

.fb-top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: calc(var(--u) * 1.5);
  padding: calc(var(--u) * 2.2) calc(var(--u) * 2.6) 0;
  padding-top: max(calc(var(--u) * 2.2), env(safe-area-inset-top, 0px));
}
.fb-actions { display: flex; gap: 8px; }
.fb-title { display: grid; gap: calc(var(--u) * 0.4); min-width: 0; }
.fb-name {
  margin: 0;
  font: 700 calc(var(--u) * 3.1) / 1 var(--f-display);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-sub {
  font: 600 calc(var(--u) * 1.25) / 1.2 var(--f-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brass);
}
.fb-side { display: flex; align-items: flex-start; gap: calc(var(--u) * 1.2); }
.fb-pills { display: flex; gap: calc(var(--u) * 0.8); flex-wrap: wrap; justify-content: flex-end; }
.pill {
  font: 700 calc(var(--u) * 1.05) / 1 var(--f-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: calc(var(--u) * 0.6) calc(var(--u) * 1.1);
  border-radius: 999px;
  border: 1px solid var(--brass-dim);
  color: var(--ivory-dim);
  display: inline-flex;
  align-items: center;
  gap: calc(var(--u) * 0.6);
  white-space: nowrap;
}
.pill .dot { width: calc(var(--u) * 0.7); height: calc(var(--u) * 0.7); border-radius: 50%; background: currentColor; }
.pill:not(.live):not(.paused):not(.over) .dot { display: none; }
.pill.live { color: var(--ok); border-color: rgba(127, 197, 155, 0.55); }
.pill.paused { color: var(--brass); }
.pill.ko { color: #f3b2a6; border-color: rgba(243, 178, 166, 0.5); }
.pill.closed { color: var(--chip-red); border-color: rgba(224, 86, 74, 0.6); }
.pill.over { color: var(--ivory); background: var(--chip-red); border-color: var(--chip-red); }

.fb-main {
  display: grid;
  /* the side rails get room for big numbers (read from across the room) */
  grid-template-columns: 1.15fr 2fr 1.15fr;
  gap: calc(var(--u) * 2);
  align-items: center;
  padding: calc(var(--u) * 1.5) calc(var(--u) * 2.6);
  min-height: 0;
}
.fb-rail { display: grid; gap: calc(var(--u) * 2); align-content: center; min-width: 0; }
.fb-rail.right { text-align: right; }
.stat { display: grid; gap: calc(var(--u) * 0.25); }
.stat .k {
  font: 600 calc(var(--u) * 1.55) / 1 var(--f-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brass);
}
.stat .v {
  font: 700 calc(var(--u) * 5) / 1 var(--f-display);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.stat .v small {
  font: 600 calc(var(--u) * 1.8) / 1 var(--f-label);
  color: var(--ivory-dim);
  letter-spacing: 0.06em;
  margin-left: calc(var(--u) * 0.5);
}
.stat.big .v { font-size: calc(var(--u) * 6.4); }
.payouts { display: grid; gap: calc(var(--u) * 0.35); }
.payouts div {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--u) * 1.2);
  font: 600 calc(var(--u) * 2.7) / 1.1 var(--f-display);
  font-variant-numeric: tabular-nums;
}
.payouts span:first-child { color: var(--brass); }

.fb-center { display: grid; justify-items: center; gap: calc(var(--u) * 1.1); min-width: 0; }
.lvl {
  font: 700 calc(var(--u) * 1.5) / 1 var(--f-label);
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--brass);
}
.blinds { display: grid; grid-template-columns: repeat(3, auto); align-items: end; }
.blinds > div { display: grid; justify-items: center; gap: calc(var(--u) * 0.35); padding-inline: calc(var(--u) * 2); }
.blinds > div + div { border-left: 1px solid rgba(207, 174, 106, 0.4); }
.blinds .k {
  font: 600 calc(var(--u) * 0.95) / 1 var(--f-label);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ivory-dim);
}
.blinds .v {
  font: 800 calc(var(--u) * 5.4) / 0.9 var(--f-display);
  font-variant-numeric: tabular-nums;
}
.blinds .ante .v { color: var(--ivory-dim); font-weight: 700; }
.blinds.flash .v { animation: brass-flash 1.2s ease-out; }
@keyframes brass-flash {
  0% { color: var(--brass); text-shadow: 0 0 calc(var(--u) * 2) rgba(207, 174, 106, 0.7); }
  100% { text-shadow: none; }
}
.break-title {
  font: 800 calc(var(--u) * 5.4) / 0.9 var(--f-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--brass);
}

.timer {
  font: 800 calc(var(--u) * 15.5) / 0.82 var(--f-display);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  transition: color 0.4s;
}
.timer.warn { color: #f0c979; }
.timer.critical { color: var(--chip-red); animation: pulse 1s steps(2, start) infinite; }
.timer.done { color: var(--ivory-dim); }
@keyframes pulse { 50% { opacity: 0.55; } }

.drain {
  width: 100%;
  height: calc(var(--u) * 0.45);
  background: rgba(10, 33, 25, 0.8);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(207, 174, 106, 0.25);
}
.drain > i { display: block; height: 100%; background: var(--brass); border-radius: inherit; transition: width 0.25s linear; }

.next {
  font: 600 calc(var(--u) * 2) / 1 var(--f-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ivory-dim);
}
.next b { color: var(--ivory); font-family: var(--f-display); font-weight: 700; letter-spacing: 0.03em; font-size: 1.15em; }

.fb-strip {
  display: grid;
  gap: calc(var(--u) * 0.6);
  padding: 0 calc(var(--u) * 2.6) calc(var(--u) * 2);
  padding-bottom: max(calc(var(--u) * 2), env(safe-area-inset-bottom, 0px));
}
.strip-head {
  display: flex;
  justify-content: space-between;
  font: 600 calc(var(--u) * 0.95) / 1 var(--f-label);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--brass);
}
.strip-head span:last-child { color: var(--ivory-dim); }
.segs { position: relative; display: flex; gap: 3px; height: calc(var(--u) * 2.3); }
.sg {
  position: relative;
  flex: var(--w) 1 0;
  min-width: 0;
  border-radius: 3px;
  background: rgba(243, 236, 221, 0.14);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.sg.done { background: rgba(207, 174, 106, 0.55); }
.sg.brk { background: repeating-linear-gradient(135deg, rgba(243, 236, 221, 0.14) 0 4px, transparent 4px 8px); }
.sg.brk.done { background: repeating-linear-gradient(135deg, rgba(207, 174, 106, 0.55) 0 4px, transparent 4px 8px); }
.sg.cur { background: rgba(243, 236, 221, 0.18); box-shadow: inset 0 0 0 1px var(--brass); }
.sg > i { position: absolute; inset: 0 auto 0 0; width: var(--p); background: var(--brass); }
.sg > b {
  position: relative;
  font: 700 calc(var(--u) * 0.95) / 1 var(--f-label);
  letter-spacing: 0.06em;
  color: rgba(243, 236, 221, 0.8);
}
.sg.done > b, .sg.cur > b { color: #1a1811; }
.mark {
  position: absolute;
  top: calc(var(--u) * -1.1);
  bottom: calc(var(--u) * -0.4);
  width: 2px;
  background: var(--chip-red);
  left: calc(var(--x) - 1px);
}
.mark span {
  position: absolute;
  top: calc(var(--u) * -1.2);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font: 700 calc(var(--u) * 0.85) / 1 var(--f-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--chip-red);
}

/* Phones / portrait: timer on top, stats in two columns */
@container (max-width: 720px) {
  .fb-top, .fb-main, .fb-strip { --u: min(2.1cqw, 1.1cqh); }
  /* keep small caps readable on a phone */
  .stat .k, .blinds .k, .pill, .strip-head, .fb-sub, .mark span { font-size: max(11px, calc(var(--u) * 1.05)); }
  .timer { font-size: calc(var(--u) * 15); }
  .fb-top { grid-template-columns: auto 1fr; padding-inline: 16px; }
  .fb-side { grid-column: 1 / -1; justify-content: space-between; }
  .fb-pills { justify-content: flex-start; }
  .fb-main { grid-template-columns: 1fr 1fr; padding-inline: 16px; align-content: center; }
  .fb-center { grid-column: 1 / -1; order: -1; }
  .blinds .v { font-size: calc(var(--u) * 6.4); }
  .fb-rail.right { text-align: left; }
  .payouts div { justify-content: flex-start; }
  .fb-strip { padding-inline: 16px; }
  .sg > b { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .timer.critical, .blinds.flash .v { animation: none; }
  .drain > i { transition: none; }
}
</style>
