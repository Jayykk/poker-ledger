<template>
  <div ref="stage" class="ms-stage" :class="{ revealing: !!reveal }">
    <div class="ms-bg"></div>

    <!-- Header: event, level, the pool -->
    <div class="ms-head">
      <div class="min-w-0">
        <div class="ms-title">🎁 {{ $t('mystery.title') }}</div>
        <div class="ms-subtitle">{{ subtitle }}</div>
      </div>
      <div class="ms-pool">
        <div class="ms-k">{{ $t('mystery.pool') }}</div>
        <div class="ms-pool-v">${{ fmt(pool) }}</div>
      </div>
      <button v-if="canControl" type="button" class="ms-close" @click="$emit('close')">
        ⏱ {{ $t('mystery.backToClock') }}
      </button>
    </div>

    <!-- Envelope wall: every envelope, drawn ones dimmed -->
    <div class="ms-wall" :style="{ '--cols': wallCols }">
      <div
        v-for="s in slots"
        :key="s.slot"
        :data-slot="s.slot"
        class="ms-env"
        :class="{ gone: isGone(s.slot), top: s.tier === 0, flying: reveal && reveal.slot === s.slot }"
      >
        <span class="ms-env-amt">${{ fmt(amounts[s.slot] || 0) }}</span>
      </div>
    </div>

    <!-- Queue + history -->
    <div class="ms-side">
      <div class="ms-box">
        <div class="ms-k">{{ reveal ? $t('mystery.drawingNow') : $t('mystery.waiting') }}</div>
        <div v-if="reveal" class="ms-q now">
          <span class="ms-q-name">{{ reveal.names }}</span>
          <span class="ms-gift">🎁</span>
        </div>
        <template v-else>
          <div v-if="!pending.length" class="ms-q-empty">{{ $t('mystery.none') }}</div>
          <button
            v-for="tk in pending"
            :key="tk.id"
            type="button"
            class="ms-q"
            :class="{ tappable: canControl, picking: picking === tk.id }"
            :disabled="!canControl || busy"
            @click="onPick(tk)"
          >
            <span class="min-w-0 text-left">
              <span class="ms-q-name">{{ namesOf(tk.by) }}</span>
              <span class="ms-q-sub">{{ tk.final ? $t('mystery.ticketFinal') : $t('mystery.ticketKo', { victim: nameOf(tk.holderId) }) }}</span>
            </span>
            <span class="ms-gift">🎁</span>
          </button>
          <!-- Physical envelopes: which one did they draw? -->
          <div v-if="picking && drawMode === 'manual'" class="ms-tiers">
            <div class="ms-k">{{ $t('mystery.pick') }}</div>
            <button v-for="tier in tiersLeft" :key="tier.tier" type="button" class="ms-tier" :disabled="busy" @click="drawTier(tier.tier)">
              ${{ fmt(tier.amount) }}
            </button>
          </div>
          <div v-if="canControl && drawMode !== 'manual' && pending.length" class="ms-hint">{{ $t('mystery.stageHint') }}</div>
        </template>
      </div>
      <div class="ms-box ms-hist">
        <div class="ms-k">{{ $t('mystery.history') }}</div>
        <TransitionGroup name="ms-hist">
          <div v-for="tk in history" :key="tk.id" class="ms-h">
            <span class="truncate">{{ namesOf(tk.by) }} · {{ tk.final ? $t('mystery.ticketFinal') : $t('mystery.ticketKo', { victim: nameOf(tk.holderId) }) }}</span>
            <span class="ms-h-amt">${{ fmt(amounts[tk.envelope] || 0) }}</span>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <!-- Reveal -->
    <div class="ms-dim" :class="{ on: !!reveal }"></div>
    <div ref="rays" class="ms-rays"></div>
    <div ref="card" class="ms-card">
      <div class="ms-card-back"><span ref="qmark" class="ms-q-mark">?</span></div>
      <div class="ms-card-front">
        <div v-if="revealed" class="ms-card-amt">${{ fmt(shownAmount) }}</div>
        <div v-else class="ms-card-amt ms-card-hidden">?</div>
        <div class="ms-card-name" :class="{ on: nameShown }">{{ reveal?.names }} {{ $t('mystery.youDrew') }}！</div>
        <div v-if="reveal?.split" class="ms-card-split" :class="{ on: nameShown }">{{ reveal.split }}</div>
      </div>
    </div>
    <div ref="flash" class="ms-flash"></div>
  </div>
</template>

<script setup>
// TV draw stage for mystery bounties (shown on the clock screen — the iPad
// that's cast to the TV). Full-screen and scaled to the screen like the clock
// faces. Reveals each new draw (from any device) with the envelope flying off
// the wall, a slow build-up spin, a flash and a count-up of the amount.
// The host (or a dealer-mode clock) can also draw from here.
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from '../../utils/formatters.js';
import {
  envelopeSlots, envelopeAmounts, remainingSlots, allTickets, bountyPool, gameBountyPerEntry, slotOfTier,
} from '../../utils/bounty.js';

const props = defineProps({
  game: { type: Object, default: null },
  // The draw to reveal now (a drawn ticket), or null
  current: { type: Object, default: null },
  // Host / dealer-mode clock: may draw here and close the stage
  canControl: { type: Boolean, default: false },
  subtitle: { type: String, default: '' },
});
const emit = defineEmits(['done', 'close', 'draw']);
const { t } = useI18n();

const fmt = (n) => formatNumber(Math.round(Number(n) || 0));
const players = computed(() => props.game?.players || []);
const bounty = computed(() => props.game?.bounty || null);
const drawMode = computed(() => bounty.value?.drawMode || 'system');
const pool = computed(() => (props.game
  ? bountyPool(players.value, props.game.baseBuyIn, gameBountyPerEntry(props.game))
  : 0));
const slots = computed(() => envelopeSlots(bounty.value));
const amounts = computed(() => envelopeAmounts(bounty.value, pool.value));
const wallCols = computed(() => Math.min(8, Math.max(3, Math.ceil(Math.sqrt(slots.value.length * 1.6)))));
const tickets = computed(() => allTickets(players.value));
const pending = computed(() => tickets.value.filter((tk) => tk.envelope === null || tk.envelope === undefined));
// Hide the draw being revealed from the wall / history until it lands
const history = computed(() => tickets.value
  .filter((tk) => tk.envelope !== null && tk.envelope !== undefined && (!reveal.value || tk.id !== reveal.value.id || landed.value))
  .sort((a, b) => (b.drawnAt || 0) - (a.drawnAt || 0)));
const remaining = computed(() => remainingSlots(bounty.value, players.value));
const isGone = (slot) => !remaining.value.some((s) => s.slot === slot) && !(reveal.value && reveal.value.slot === slot && !flown.value);
const tiersLeft = computed(() => (bounty.value?.envelopes || []).map((e, tier) => ({
  tier,
  amount: amounts.value[slots.value.find((s) => s.tier === tier)?.slot] || 0,
  left: remaining.value.filter((s) => s.tier === tier).length,
})).filter((x) => x.left > 0));

const nameOf = (id) => players.value.find((p) => p.id === id)?.name || '?';
const namesOf = (ids = []) => ids.map(nameOf).join('、');

// ── host draws on the stage ──────────────────────────
const busy = ref(false);
const picking = ref(null);
function randomSlot() {
  const free = remaining.value;
  if (!free.length) return null;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return free[buf[0] % free.length].slot;
}
function onPick(tk) {
  if (!props.canControl || busy.value) return;
  if (drawMode.value === 'manual') {
    picking.value = picking.value === tk.id ? null : tk.id;
    return;
  }
  const slot = randomSlot();
  if (slot !== null) emit('draw', tk, slot);
}
function drawTier(tier) {
  const tk = pending.value.find((x) => x.id === picking.value);
  const slot = slotOfTier(bounty.value, players.value, tier);
  picking.value = null;
  if (tk && slot !== null) emit('draw', tk, slot);
}

// ── reveal ──────────────────────────────────────────
const stage = ref(null);
const card = ref(null);
const rays = ref(null);
const flash = ref(null);
const qmark = ref(null);
const reveal = ref(null); // { id, slot, amount, names, split }
const flown = ref(false); // the envelope has left the wall
const landed = ref(false); // the result is in the history
const shownAmount = ref(0);
const nameShown = ref(false);
// The face stays a "?" through the spin; the amount appears after the flash
const revealed = ref(false);
let timers = [];
let raf = 0;
const wait = (ms) => new Promise((r) => { timers.push(setTimeout(r, ms)); });

function confetti(n) {
  const el = stage.value;
  if (!el) return;
  const colors = ['#f5c451', '#ffe08a', '#ff6b81', '#5ee7c4', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'ms-conf';
    c.style.background = colors[i % colors.length];
    if (i % 3 === 0) c.style.borderRadius = '50%';
    el.appendChild(c);
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 48;
    c.animate([
      { transform: 'translate(-50%, -50%) rotate(0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}cqw, ${Math.sin(a) * d + 22}cqh) rotate(${Math.random() * 1080}deg) scale(0.6)`, opacity: 0 },
    ], { duration: 1800 + Math.random() * 1200, easing: 'cubic-bezier(.12,.75,.3,1)', fill: 'forwards' });
    timers.push(setTimeout(() => c.remove(), 3200));
  }
}

function countUp(target, ms) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    // ease-out: quick then settling, so the last digits tick visibly
    shownAmount.value = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

async function play(tk) {
  const slot = tk.envelope;
  reveal.value = {
    id: tk.id,
    slot,
    amount: amounts.value[slot] || 0,
    names: namesOf(tk.by),
    split: tk.by.length > 1 ? t('mystery.split', { names: namesOf(tk.by) }) : '',
  };
  flown.value = false;
  landed.value = false;
  nameShown.value = false;
  revealed.value = false;
  shownAmount.value = 0;
  await nextTick();

  const stageEl = stage.value;
  const cardEl = card.value;
  const src = stageEl.querySelector(`[data-slot="${slot}"]`);
  const s = stageEl.getBoundingClientRect();
  const r = src ? src.getBoundingClientRect() : { left: s.left + s.width / 2, top: s.top + s.height / 2, width: 10, height: 10 };
  // Final card: about a third of the stage wide
  const W = Math.min(s.width * 0.34, s.height * 0.62);
  const H = W * 0.72;
  const fromX = r.left - s.left + r.width / 2 - W / 2;
  const fromY = r.top - s.top + r.height / 2 - H / 2;
  const toX = s.width / 2 - W / 2;
  const toY = s.height / 2 - H / 2;
  Object.assign(cardEl.style, { width: `${W}px`, height: `${H}px`, left: '0px', top: '0px', display: 'block' });
  const scale0 = r.width / W;
  flown.value = true;

  // 1 · lift off the wall and fly to the centre
  await cardEl.animate([
    { transform: `translate(${fromX}px, ${fromY}px) scale(${scale0}) rotateY(0)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.06) rotateY(0) rotateZ(-4deg)` },
  ], { duration: 900, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }).finished;

  // 2 · tension: shake, pulsing "?"
  qmark.value?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
    { duration: 420, iterations: 3, easing: 'ease-in-out' });
  await cardEl.animate([
    { transform: `translate(${toX}px, ${toY}px) scale(1.06) rotateZ(-4deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.08) rotateZ(4deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.06) rotateZ(-3deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.1) rotateZ(3deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.06) rotateZ(0)` },
  ], { duration: 1100, easing: 'ease-in-out', fill: 'forwards' }).finished;

  // 3 · the spin: fast, then slowing; rays brightening behind it
  rays.value?.animate([
    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6) rotate(0)' },
    { opacity: 0.55, transform: 'translate(-50%, -50%) scale(1.1) rotate(120deg)', offset: 0.6 },
    { opacity: 0.95, transform: 'translate(-50%, -50%) scale(1.35) rotate(220deg)' },
  ], { duration: 2800, easing: 'ease-in', fill: 'forwards' });
  await cardEl.animate([
    { transform: `translate(${toX}px, ${toY}px) scale(1.06) rotateY(0)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.12) rotateY(1980deg)` },
  ], { duration: 2800, easing: 'cubic-bezier(.35,.05,.15,1)', fill: 'forwards' }).finished;

  // 4 · flash, then the amount counts up
  flash.value?.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }],
    { duration: 700, easing: 'ease-out' });
  rays.value?.animate([
    { opacity: 0.95, transform: 'translate(-50%, -50%) scale(1.35) rotate(220deg)' },
    { opacity: 0.6, transform: 'translate(-50%, -50%) scale(1.6) rotate(400deg)' },
  ], { duration: 4000, easing: 'linear', fill: 'forwards' });
  cardEl.animate([
    { transform: `translate(${toX}px, ${toY}px) scale(1.12) rotateY(1980deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.22) rotateY(1980deg)` },
    { transform: `translate(${toX}px, ${toY}px) scale(1.16) rotateY(1980deg)` },
  ], { duration: 600, easing: 'ease-out', fill: 'forwards' });
  revealed.value = true;
  confetti(140);
  countUp(reveal.value.amount, 1100);
  await wait(900);
  nameShown.value = true;
  await wait(250);
  confetti(60);

  // 5 · hold, then it lands in the history (8 s from the start in all)
  await wait(1800);
  cardEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
  rays.value?.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
  await wait(400);
  landed.value = true;
  cleanupCard();
  reveal.value = null;
  emit('done', tk);
}

function cleanupCard() {
  cancelAnimationFrame(raf);
  for (const el of [card.value, rays.value]) el?.getAnimations().forEach((a) => a.cancel());
  if (card.value) card.value.style.display = 'none';
}

watch(() => props.current, (tk) => {
  if (tk && (!reveal.value || reveal.value.id !== tk.id)) play(tk);
}, { immediate: true });

onUnmounted(() => {
  timers.forEach(clearTimeout);
  cleanupCard();
});
</script>

<style scoped>
.ms-stage {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  container-type: size;
  color: #eef1f7;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  background: #0d1220;
  perspective: 1600px;
}
.ms-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 30% 55%, rgba(201, 162, 74, 0.10), transparent 70%),
    radial-gradient(ellipse 50% 60% at 85% 30%, rgba(122, 167, 255, 0.07), transparent 70%);
}
.ms-k { font-size: max(11px, 1.35cqw); color: #8f9bb3; margin-bottom: 0.8cqh; letter-spacing: 0.04em; }

.ms-head { position: absolute; left: 3cqw; right: 3cqw; top: 3cqh; display: flex; align-items: flex-end; gap: 2cqw; }
.ms-title { font-size: max(18px, 3.2cqw); font-weight: 800; }
.ms-subtitle { font-size: max(12px, 1.5cqw); color: #8f9bb3; }
.ms-pool { margin-left: auto; text-align: right; }
.ms-pool-v { font-family: 'JetBrains Mono', monospace; font-size: max(22px, 4.4cqw); font-weight: 800; color: #f5c451; line-height: 1; }
.ms-close {
  align-self: center;
  padding: 1cqh 1.4cqw;
  border-radius: 999px;
  font-size: max(12px, 1.4cqw);
  color: #e6ebf5;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.ms-wall {
  position: absolute;
  left: 3cqw;
  top: 19cqh;
  width: 59cqw;
  bottom: 5cqh;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 1.1cqw;
  align-content: start;
}
.ms-env {
  position: relative;
  aspect-ratio: 1.45;
  border-radius: 0.9cqw;
  background: linear-gradient(160deg, #d8b25a, #b88a33);
  box-shadow: inset 0 -0.4cqh 0 rgba(0, 0, 0, 0.18), 0 0.6cqh 1.2cqh rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: opacity 0.5s, filter 0.5s, transform 0.3s;
}
.ms-env::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 52%;
  background: linear-gradient(180deg, #c99c40, #b0832c);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  border-radius: 0.9cqw 0.9cqw 0 0;
}
.ms-env::after {
  content: '';
  position: absolute;
  top: 40%;
  left: 50%;
  width: 14%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff8a8a, #b3262e);
}
.ms-env.top { background: linear-gradient(160deg, #f0cd6a, #c99a3a); }
.ms-env-amt {
  position: relative;
  margin-bottom: 8%;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  font-size: max(10px, 1.55cqw);
  color: #2b1f07;
}
.ms-env.gone { opacity: 0.16; filter: grayscale(0.7); }
.ms-env.flying { opacity: 0; }

.ms-side { position: absolute; right: 3cqw; top: 19cqh; width: 31cqw; bottom: 5cqh; display: flex; flex-direction: column; gap: 1.6cqh; }
.ms-box { border-radius: 1cqw; background: rgba(24, 33, 58, 0.85); border: 1px solid rgba(255, 255, 255, 0.06); padding: 1.6cqh 1.4cqw; }
.ms-q {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1cqw;
  width: 100%;
  padding: 1cqh 1cqw;
  margin-top: 0.6cqh;
  border-radius: 0.8cqw;
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
}
.ms-q.tappable { border: 1px solid rgba(245, 196, 81, 0.35); }
.ms-q.tappable:active { transform: scale(0.98); }
.ms-q.picking { background: rgba(245, 196, 81, 0.15); }
.ms-q.now { border: 1px solid rgba(245, 196, 81, 0.6); background: rgba(245, 196, 81, 0.12); animation: ms-pulse 1s ease-in-out infinite; }
.ms-q-name { display: block; font-size: max(14px, 2cqw); font-weight: 700; }
.ms-q-sub { display: block; font-size: max(11px, 1.25cqw); color: #8f9bb3; }
.ms-q-empty { font-size: max(12px, 1.5cqw); color: #8f9bb3; padding: 1cqh 0; }
.ms-gift { font-size: max(16px, 2.4cqw); }
.ms-hint { margin-top: 1cqh; font-size: max(11px, 1.2cqw); color: #8f9bb3; }
.ms-tiers { display: flex; flex-wrap: wrap; gap: 0.6cqw; margin-top: 1.2cqh; }
.ms-tiers .ms-k { width: 100%; margin-bottom: 0; }
.ms-tier { padding: 0.8cqh 1cqw; border-radius: 0.6cqw; font-family: 'JetBrains Mono', monospace; font-size: max(12px, 1.5cqw); color: #f5c451; border: 1px solid rgba(245, 196, 81, 0.5); }
.ms-hist { flex: 1; overflow: hidden; }
.ms-h { display: flex; justify-content: space-between; gap: 1cqw; font-size: max(12px, 1.5cqw); padding: 0.7cqh 0; border-top: 1px solid rgba(255, 255, 255, 0.05); }
.ms-h-amt { font-family: 'JetBrains Mono', monospace; color: #5ee7c4; font-weight: 700; flex-shrink: 0; }
.ms-hist-enter-active { transition: all 0.6s cubic-bezier(.2,1.2,.4,1); }
.ms-hist-enter-from { opacity: 0; transform: translateX(3cqw) scale(0.9); }

.ms-dim { position: absolute; inset: 0; background: rgba(5, 8, 15, 0.82); opacity: 0; transition: opacity 0.5s; pointer-events: none; z-index: 4; }
.ms-dim.on { opacity: 1; }
.ms-rays {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120cqh;
  height: 120cqh;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(rgba(245, 196, 81, 0.28) 0 6deg, transparent 6deg 18deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%);
  mask: radial-gradient(circle, #000 18%, transparent 68%);
  opacity: 0;
  pointer-events: none;
  z-index: 5;
}
.ms-card { position: absolute; display: none; transform-style: preserve-3d; z-index: 6; }
.ms-card-back, .ms-card-front {
  position: absolute;
  inset: 0;
  border-radius: 1.4cqw;
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ms-card-back {
  background: linear-gradient(160deg, #f0cd6a, #b8892f);
  box-shadow: 0 2cqh 5cqh rgba(0, 0, 0, 0.5);
}
.ms-card-back::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 54%;
  background: linear-gradient(180deg, #d7a944, #b0832c);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  border-radius: 1.4cqw 1.4cqw 0 0;
}
.ms-q-mark { position: relative; font-size: 9cqh; font-weight: 900; color: #fff7dc; text-shadow: 0 0.5cqh 1.5cqh rgba(0, 0, 0, 0.35); }
.ms-card-front {
  transform: rotateY(180deg);
  background: linear-gradient(160deg, #fffaf0, #f4e6c4);
  box-shadow: 0 0 6cqh rgba(245, 196, 81, 0.65), 0 2cqh 5cqh rgba(0, 0, 0, 0.5);
}
.ms-card-amt { font-family: 'JetBrains Mono', monospace; font-size: 11cqh; font-weight: 900; color: #b07d10; line-height: 1; font-variant-numeric: tabular-nums; }
.ms-card-hidden { color: #d9b763; }
.ms-card-name, .ms-card-split { margin-top: 1.6cqh; font-size: 3.2cqh; font-weight: 800; color: #3a2a08; opacity: 0; transform: translateY(1cqh); transition: all 0.5s; }
.ms-card-split { font-size: 2.2cqh; font-weight: 600; margin-top: 0.6cqh; }
.ms-card-name.on, .ms-card-split.on { opacity: 1; transform: none; }
.ms-flash { position: absolute; inset: 0; background: #fffbe8; opacity: 0; pointer-events: none; z-index: 7; }
:deep(.ms-conf) { position: absolute; left: 50%; top: 50%; width: 0.8cqw; height: 1.3cqw; z-index: 8; pointer-events: none; }
@keyframes ms-pulse { 50% { box-shadow: 0 0 0 0.4cqw rgba(245, 196, 81, 0.25); } }

/* Portrait iPad / phone: wall on top, lists below */
@container (orientation: portrait) {
  .ms-wall { left: 4cqw; right: 4cqw; width: auto; top: 14cqh; bottom: auto; height: 46cqh; }
  .ms-side { left: 4cqw; right: 4cqw; width: auto; top: 62cqh; bottom: 3cqh; flex-direction: row; }
  .ms-side .ms-box { flex: 1; }
  .ms-env-amt { font-size: max(10px, 2.6cqw); }
  .ms-title { font-size: max(18px, 5cqw); }
  .ms-pool-v { font-size: max(22px, 6.5cqw); }
  .ms-q-name { font-size: max(14px, 3.2cqw); }
}
</style>
