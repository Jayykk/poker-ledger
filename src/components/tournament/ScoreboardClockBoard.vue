<template>
  <div class="sb-board" :class="stateClass">
    <!-- Header: name / format · level · status + host actions -->
    <header class="sb-top">
      <div class="sb-left">
        <div class="sb-actions"><slot name="actions-left" /></div>
        <div class="sb-who">
          <h1 class="sb-name">{{ name }}</h1>
          <div v-if="subtitle" class="sb-sub">{{ subtitle }}</div>
        </div>
      </div>
      <div class="sb-level">{{ isBreak ? t('clockFace.breakTitle') : t('clockFace.level', { level: currentLevel }) }}</div>
      <div class="sb-right">
        <div class="sb-pills">
          <span class="sb-pill" :class="statusPillClass">{{ statusText }}</span>
          <span v-if="cutoffLevel > 0 || isTimed" class="sb-pill" :class="{ closed: buyInClosed }">{{ buyInText }}</span>
          <span v-if="bountyPerHead > 0" class="sb-pill ko">{{ bountyLabel }} ${{ fmt(bountyPerHead) }}</span>
          <slot name="pills-extra" />
        </div>
        <div class="sb-actions"><slot name="actions-right" /></div>
      </div>
    </header>

    <!-- Centre: blinds, timer (the hero), progress, next level -->
    <main class="sb-main">
      <div v-if="!isBreak" class="sb-blinds" :class="{ flash }">
        <div class="sb-bl">{{ fmt(currentBlinds.small) }}<span class="sl">/</span>{{ fmt(currentBlinds.big) }}</div>
        <div v-if="currentBlinds.ante" class="sb-ante">
          <span class="k">{{ t('clockFace.ante') }}</span>
          <span class="v">{{ fmt(currentBlinds.ante) }}</span>
        </div>
      </div>
      <div v-else class="sb-break">{{ t('clockFace.breakTitle') }}</div>

      <div class="sb-timer">{{ formattedTime }}</div>
      <div v-if="status !== 'ended'" class="sb-prog" aria-hidden="true">
        <i :style="{ width: `${levelProgress * 100}%` }"></i>
      </div>
      <div v-else class="sb-over">{{ isTimed ? t('clockFace.timeUp') : t('clockFace.ended') }}</div>

      <div v-if="status !== 'ended'" class="sb-next">
        <span class="k">{{ t('clockFace.next') }}</span>
        <span v-if="nextPlayLevelEntry" class="v">
          {{ fmt(nextPlayLevelEntry.small) }} / {{ fmt(nextPlayLevelEntry.big) }}<span v-if="nextPlayLevelEntry.ante" class="a">{{ t('clockFace.ante') }} {{ fmt(nextPlayLevelEntry.ante) }}</span>
        </span>
        <span v-else class="v">{{ isTimed ? t('clockFace.finalLevel') : t('clockFace.finalRepeats') }}</span>
      </div>
    </main>

    <!-- Tiles: featured figure | avg stack | break in | players / entries -->
    <footer class="sb-tiles">
      <div class="sb-tile feature">
        <span class="k">{{ isTimed ? t('clockFace.endsIn') : t('clockFace.prizePool') }}</span>
        <span class="v">{{ isTimed ? (status === 'ended' ? '00:00' : (timeToEnd || '—')) : `$${fmt(prizePool)}` }}</span>
        <div v-if="isTimed" class="d">{{ endsAt ? `${t('clockFace.endsAt')} ${endsAt}` : ' ' }}</div>
        <div v-else-if="payouts.length" class="pay">
          <div v-for="p in payouts.slice(0, 3)" :key="p.place">
            <span class="pk">{{ placeLabel(p.place) }}</span>
            <span class="pv">${{ fmt(p.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="sb-tile big">
        <span class="k">{{ t('clockFace.avgStack') }}</span>
        <span class="v">{{ fmt(averageStack) }}</span>
        <div class="d">{{ averageStackBB ? `${averageStackBB} BB` : ' ' }}</div>
      </div>

      <!-- no detail line: a larger figure fills the tile instead -->
      <div class="sb-tile big solo">
        <span class="k">{{ t('clockFace.breakIn') }}</span>
        <span class="v">{{ timeToBreak || '—' }}</span>
      </div>

      <div class="sb-tile stack">
        <div class="mini">
          <span class="k">{{ isTimed ? t('clockFace.players') : t('clockFace.playersLeft') }}</span>
          <span class="v">{{ isTimed ? fmt(playersRegistered) : `${fmt(playersRemaining)}/${fmt(playersRegistered)}` }}</span>
        </div>
        <div class="mini">
          <span class="k">{{ isTimed ? t('clockFace.buyIns') : t('clockFace.entries') }}</span>
          <span class="v">{{ fmt(entries) }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
// Style 1 ("classic") clock face — broadcast-scoreboard layout: the timer is
// the hero with the blinds right above it, the next level right below, and
// the stats in one row of tiles (featured prize pool / time to end, avg
// stack, break in, players + entries). Pure presentation — every value comes
// from useTournamentClock.
import { computed, ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from './dealerClockFormat.js';

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
const statusPillClass = computed(() => ({
  live: props.status === 'running',
  over: props.status === 'ended',
}));
const buyInText = computed(() => {
  if (props.isTimed) return props.buyInClosed ? t('clockFace.buyInClosed') : t('clockFace.buyInOpen');
  return props.buyInClosed ? t('clockFace.regClosed') : t('clockFace.regOpen');
});

// Whole-board state tint: break / last minute / last 10 s / time's up
const stateClass = computed(() => {
  if (props.status === 'ended') return 'is-over';
  if (props.isBreak) return 'is-break';
  if (props.status !== 'running') return '';
  if (props.localTimeLeft <= 10) return 'is-critical';
  if (props.localTimeLeft <= 60) return 'is-warn';
  return '';
});

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}TH`;
  return `${n}${['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH'}`;
}
const placeLabel = (n) => t('clockFace.place', { n, ord: ordinal(n) });

// Brief glow on the blinds when the level changes
const flash = ref(false);
watch(() => props.currentLevelIndex, async (v, old) => {
  if (old === undefined || v === old) return;
  flash.value = false;
  await nextTick();
  flash.value = true;
});
</script>

<style scoped>
.sb-board {
  --hi: #1c355c;
  --lo: #0a1425;
  --text: #f5f7fb;
  --muted: #9fb2cc;
  --line: rgba(245, 247, 251, 0.12);
  --accent: #8cc8ff;
  --amber: #ffc857;
  --red: #ff5d6c;
  --teal: #4fd1b5;
  --tile: #0d1a2f;
  --tint: transparent;
  --f: 'Noto Sans TC', system-ui, -apple-system, 'PingFang TC', 'Microsoft JhengHei', sans-serif;

  container-type: size;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: var(--text);
  font-family: var(--f);
  background:
    linear-gradient(180deg, var(--tint), transparent 55%),
    radial-gradient(110% 80% at 50% 35%, var(--hi) 0%, var(--lo) 75%);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  transition: background 0.6s;
}
.sb-board.is-break { --tint: rgba(79, 209, 181, 0.28); }
.sb-board.is-warn { --tint: rgba(255, 200, 87, 0.22); }
.sb-board.is-critical { --tint: rgba(255, 93, 108, 0.32); }
.sb-board.is-over { --tint: rgba(255, 93, 108, 0.4); }

/* Scale unit, set on the children (a container query can't match the
   container itself): fits a 16:9 TV and a squarer tablet */
.sb-top, .sb-main, .sb-tiles { --u: min(1cqw, 1.75cqh); }

/* ── Header ─────────────────────────────────── */
.sb-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: calc(var(--u) * 1.4) calc(var(--u) * 2.4);
  padding-top: max(calc(var(--u) * 1.4), env(safe-area-inset-top, 0px));
  border-bottom: 1px solid var(--line);
}
.sb-left, .sb-right { display: flex; align-items: center; gap: calc(var(--u) * 1.2); min-width: 0; }
.sb-right { justify-content: flex-end; }
.sb-actions { display: flex; gap: 8px; flex-shrink: 0; }
.sb-actions:empty { display: none; }
.sb-who { display: grid; gap: calc(var(--u) * 0.3); min-width: 0; }
.sb-name {
  margin: 0;
  font: 700 calc(var(--u) * 2.2) / 1.1 var(--f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-sub { font: 500 max(11px, calc(var(--u) * 1.15)) / 1.2 var(--f); color: var(--muted); letter-spacing: 0.04em; }
.sb-level {
  font: 900 calc(var(--u) * 2.4) / 1 var(--f);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: calc(var(--u) * 0.7) calc(var(--u) * 2);
  border-radius: 999px;
  background: rgba(140, 200, 255, 0.14);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(140, 200, 255, 0.35);
  white-space: nowrap;
}
.is-break .sb-level { background: rgba(79, 209, 181, 0.18); color: var(--teal); box-shadow: inset 0 0 0 1px rgba(79, 209, 181, 0.45); }
.sb-pills { display: flex; gap: calc(var(--u) * 0.7); justify-content: flex-end; flex-wrap: wrap; }
.sb-pill {
  font: 700 max(11px, calc(var(--u) * 1.1)) / 1 var(--f);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: calc(var(--u) * 0.55) calc(var(--u) * 1.1);
  border-radius: 999px;
  background: rgba(245, 247, 251, 0.08);
  color: var(--muted);
  white-space: nowrap;
}
.sb-pill.live { color: #7fe0a8; background: rgba(127, 224, 168, 0.12); }
.sb-pill.closed { color: var(--red); background: rgba(255, 93, 108, 0.14); }
.sb-pill.over { color: #fff; background: var(--red); }
.sb-pill.ko { color: #fda4af; background: rgba(244, 63, 94, 0.14); }

/* ── Centre ─────────────────────────────────── */
.sb-main {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: calc(var(--u) * 0.8);
  padding: calc(var(--u) * 1.2) calc(var(--u) * 2.4);
  min-height: 0;
}
.sb-main > * { max-width: 100%; }
.sb-blinds { display: flex; align-items: center; gap: calc(var(--u) * 1.6); flex-wrap: wrap; justify-content: center; }
.sb-bl { font: 900 calc(var(--u) * 8.2) / 1 var(--f); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.sb-bl .sl { color: var(--muted); font-weight: 500; margin-inline: calc(var(--u) * 0.6); }
.sb-blinds.flash .sb-bl { animation: sb-flash 1.2s ease-out; }
@keyframes sb-flash {
  0% { color: var(--accent); text-shadow: 0 0 calc(var(--u) * 2) rgba(140, 200, 255, 0.7); }
  100% { text-shadow: none; }
}
.sb-ante {
  display: grid;
  justify-items: center;
  gap: calc(var(--u) * 0.2);
  padding: calc(var(--u) * 0.6) calc(var(--u) * 1.4);
  border-radius: calc(var(--u) * 0.8);
  background: rgba(245, 247, 251, 0.08);
}
.sb-ante .k { font: 700 max(10px, calc(var(--u) * 1)) / 1 var(--f); letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.sb-ante .v { font: 900 calc(var(--u) * 3.6) / 1 var(--f); font-variant-numeric: tabular-nums; }
.sb-break { font: 900 calc(var(--u) * 7) / 1 var(--f); letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal); }
.sb-timer {
  font: 900 calc(var(--u) * 21) / 0.9 var(--f);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  transition: color 0.4s;
}
.is-warn .sb-timer { color: var(--amber); }
.is-critical .sb-timer { color: var(--red); animation: sb-pulse 1s steps(2, start) infinite; }
.is-over .sb-timer { color: var(--muted); }
@keyframes sb-pulse { 50% { opacity: 0.55; } }
.sb-prog {
  width: min(78%, calc(var(--u) * 70));
  height: calc(var(--u) * 0.55);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.sb-prog > i { display: block; height: 100%; background: var(--text); border-radius: inherit; transition: width 0.25s linear; }
.is-break .sb-prog > i { background: var(--teal); }
.is-warn .sb-prog > i { background: var(--amber); }
.is-critical .sb-prog > i { background: var(--red); }
.sb-over {
  font: 900 calc(var(--u) * 2.6) / 1 var(--f);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #fff;
  background: var(--red);
  padding: calc(var(--u) * 0.6) calc(var(--u) * 2.4);
  border-radius: 999px;
}
.sb-next { display: flex; align-items: baseline; gap: calc(var(--u) * 1.2); flex-wrap: wrap; justify-content: center; }
.sb-next .k { font: 700 max(11px, calc(var(--u) * 1.3)) / 1 var(--f); letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.sb-next .v { font: 900 calc(var(--u) * 3.6) / 1 var(--f); font-variant-numeric: tabular-nums; color: var(--accent); }
.sb-next .v .a { font-size: 0.62em; color: var(--muted); margin-left: calc(var(--u) * 0.8); text-transform: uppercase; }

/* ── Tiles (1px gaps draw the dividers) ─────── */
.sb-tiles {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1.45fr) minmax(0, 1.45fr) minmax(0, 1.1fr);
  gap: 1px;
  background: var(--line);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.sb-tile {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: calc(var(--u) * 0.5);
  padding: calc(var(--u) * 1.3) calc(var(--u) * 1.5);
  min-width: 0;
  background: var(--tile);
}
.sb-tile .k {
  justify-self: start;
  font: 700 max(11px, calc(var(--u) * 1.1)) / 1 var(--f);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
/* label top-left, figure and detail centred */
.sb-tile .v {
  justify-self: center;
  align-self: center;
  font: 900 calc(var(--u) * 4.4) / 1 var(--f);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sb-tile .d {
  justify-self: center;
  font: 700 max(12px, calc(var(--u) * 1.5)) / 1.3 var(--f);
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  white-space: pre;
}
/* Break in: no detail line, a larger figure fills the tile */
.sb-tile.solo { grid-template-rows: auto 1fr; }
.sb-tile.solo .v { font-size: calc(var(--u) * 5.5); }

/* featured: prize pool (tournament) / time to the end (timed game) */
.sb-tile.feature { background: #1a2130; grid-template-rows: auto auto auto; align-content: start; }
.sb-tile.feature .k { color: var(--amber); }
.sb-tile.feature .v { justify-self: start; font-size: calc(var(--u) * 4.8); color: var(--amber); }
.sb-tile.feature .d { justify-self: start; font-size: calc(var(--u) * 1.6); color: var(--text); }
.pay { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: calc(var(--u) * 1.2); margin-top: calc(var(--u) * 0.3); }
.pay > div { display: grid; gap: calc(var(--u) * 0.3); min-width: 0; }
.pay .pk { font: 700 max(10px, calc(var(--u) * 1)) / 1 var(--f); letter-spacing: 0.14em; color: var(--muted); }
.pay .pv { font: 900 calc(var(--u) * 2.1) / 1 var(--f); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* players + entries share one tile, stacked */
.sb-tile.stack { grid-template-rows: 1fr 1fr; align-content: center; gap: calc(var(--u) * 1); }
.mini { display: grid; gap: calc(var(--u) * 0.35); align-content: center; }
.mini + .mini { padding-top: calc(var(--u) * 1); border-top: 1px solid var(--line); }
.mini .v { font-size: calc(var(--u) * 2.6); }

/* Very short screens (phone landscape): the label minimums make the tiles
   relatively taller, so scale everything else down a touch */
@container (max-height: 450px) {
  .sb-top, .sb-main, .sb-tiles { --u: min(1cqw, 1.55cqh); }
}

/* ── Phones / portrait ──────────────────────── */
@container (max-width: 720px) {
  .sb-top, .sb-main, .sb-tiles { --u: min(1.9cqw, 1.1cqh); }
  .sb-top { grid-template-columns: minmax(0, 1fr) auto; padding: 14px 16px; }
  .sb-right { grid-column: 1 / -1; justify-content: space-between; }
  .sb-pills { justify-content: flex-start; }
  .sb-level { grid-row: 1; grid-column: 2; }
  .sb-main { padding: 20px 16px; }
  .sb-timer { font-size: calc(var(--u) * 15); }
  .sb-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sb-tile.feature { grid-column: 1 / -1; }
  .sb-tile .k, .sb-pill, .sb-ante .k, .sb-sub, .sb-next .k, .pay .pk { font-size: max(11px, calc(var(--u) * 1.1)); }
  .sb-tile .d { font-size: max(12px, calc(var(--u) * 1.25)); }
  .sb-tile.feature .v { font-size: max(34px, calc(var(--u) * 4.8)); }
  .pay .pv { font-size: max(16px, calc(var(--u) * 2.1)); }
}

@media (prefers-reduced-motion: reduce) {
  .is-critical .sb-timer, .sb-blinds.flash .sb-bl { animation: none; }
  .sb-prog > i { transition: none; }
}
</style>
