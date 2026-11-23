// 頭像框 effects: a canvas particle renderer, one draw function per frame.
//
// PlayerAvatar.vue lays a <canvas> over the avatar, FRAME_CANVAS_SCALE times
// its size and centred, so the effects reach outside the photo without taking
// any layout space. Each draw function paints what sits behind the face, then
// punches the face's circle out of the canvas (hole) and paints what goes in
// front (ornaments, sparks, snow).
//
// One requestAnimationFrame loop drives every avatar on the page (mountFrame
// registers, its destroy() unregisters). The loop stops while the tab is
// hidden and skips avatars that are off screen.
// 簡化特效 (:root[data-fx="lite"], utils/fx.js) and a frame mounted with
// { still } get ONE static picture instead: no particles, nothing moving, and
// they stay out of the loop. Flipping the switch is seen here (the root
// attribute is watched), no reload needed. The system's reduced-motion
// setting is deliberately NOT followed: it is on by default on many PCs
// (Windows "animation effects" off) and would hide the frames from people who
// never asked for that — the switch is the way to turn them off.
//
// A new frame = a draw function in DRAWERS under its id (+ its catalog entry
// in titleRules THEME_FRAMES or CROWN_FRAMES and its name in titles.frames.*).

const TAU = Math.PI * 2;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

// The canvas box, as a multiple of the avatar size
export const FRAME_CANVAS_SCALE = 2.1;
// The time a still frame is drawn at
const STILL_T = 0.9;
// Above this many px the effects stop growing with the avatar at full rate,
// so a large avatar (profile header) is a crisp bigger version of the small
// one instead of a blown-up one
const UNIT_FULL_UNTIL = 48;
const UNIT_SLOWER = 0.25;

/**
 * The effect unit `u` for an avatar of `size` px: size / 100 up to 48px, then
 * a quarter of the rate (80px → 0.56 instead of 0.8). Ring widths, ray
 * reach and particle sizes are all multiples of it.
 *
 * @param {number} size Avatar diameter in px.
 * @return {number}
 */
export function frameUnit(size) {
  const d = Math.max(0, Number(size) || 0);
  return (d <= UNIT_FULL_UNTIL ? d : UNIT_FULL_UNTIL + (d - UNIT_FULL_UNTIL) * UNIT_SLOWER) / 100;
}

// ── The draw functions ──────────────────────────────────────────────
// Each gets the kit `k` (context, geometry, helpers, its own state `S`) and
// the time `t` in seconds. `k.still`: a static picture — nothing is spawned
// or moved.

const DRAWERS = {
  bronze(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.4, '196,127,69', 0.16 + 0.03 * Math.sin(t * 1.6));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R + 3.4 * u, k.px(0.9, 0.5), 'rgba(243,192,138,.5)');
    k.ring(R, 4.2 * u, k.conic(0.6 + t * 0.2, ['#5c3311', '#e0a060', '#8a5226', '#f3c08a', '#6b3d16', '#d9935a', '#5c3311']), '#c47f45', 7 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(255,224,190,.55)');
    k.shine(t, 1.1, 4.2 * u, '255,214,170');
    k.hole();
    // eight rivets hammered into it; a glint hops from one to the next
    const rv = k.px(1.9, 0.9);
    for (let i = 0; i < 8; i++) {
      const [x, y] = k.at((i * TAU) / 8 + TAU / 16, R);
      const g = ctx.createRadialGradient(x - rv * 0.35, y - rv * 0.35, 0, x, y, rv);
      g.addColorStop(0, '#ffe8cc'); g.addColorStop(0.5, '#c98a4e'); g.addColorStop(1, '#4a2a0e');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rv, 0, TAU); ctx.fill();
    }
    const hop = t * 1.4;
    const [gx, gy] = k.at((Math.floor(hop) % 8) * (TAU / 8) + TAU / 16, R);
    k.star4(gx, gy, k.px(6, 2.4), t, '#ffe8cc', Math.sin((hop % 1) * Math.PI));
  },

  silver(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.5, '203,213,225', 0.17 + 0.04 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.2, ['#64748b', '#ffffff', '#94a3b8', '#f1f5f9', '#475569', '#e2e8f0', '#64748b']), '#e2e8f0', 9 * u);
    k.ring(R - 1.4 * u, k.px(0.7, 0.4), 'rgba(255,255,255,.7)');
    ctx.save(); ctx.setLineDash([2 * u, 5 * u]); ctx.lineDashOffset = -t * 10 * u; k.ring(R + 6 * u, k.px(1.2, 0.6), 'rgba(226,232,240,.7)'); ctx.restore();
    k.shine(t, 2, 4 * u, '226,240,255');
    k.hole();
    // a sprig of three silver leaves each side of the foot
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 - side * (0.28 + i * 0.3);
        const len = k.px(9.5 - i * 1.2, 3.8 - i * 0.4);
        ctx.save(); ctx.translate(...k.at(a, R + 7.5 * u)); ctx.rotate(a - side * (Math.PI / 2 - 0.6 + Math.sin(t * 1.6 + i) * 0.06));
        const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#64748b'); g.addColorStop(0.5, '#e2e8f0'); g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g; ctx.shadowColor = '#cbd5e1'; ctx.shadowBlur = 3 * u; k.leaf(len, len * 0.24, 0.45); ctx.fill(); ctx.restore();
      }
    }
    // a small cut stone set at the top
    const [sx, sy] = k.at(-Math.PI / 2, R + 4.5 * u);
    const ss = k.px(3.2, 1.4);
    ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = '#f8fafc'; ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 6 * u;
    ctx.beginPath(); ctx.moveTo(0, -ss * 1.3); ctx.lineTo(ss, 0); ctx.lineTo(0, ss * 1.3); ctx.lineTo(-ss, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    for (const s of k.fixed(4, () => ({ a: rnd(TAU), r: rnd(0, 12) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(7, 2.6), t + s.ph, '#ffffff', Math.max(0, Math.sin(t * 2 + s.ph)));
    }
  },

  // The tier frame 金框: rays, a laurel
  gold(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(12, t * 0.3, 34 * u, '255,215,0', 0.26);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.6, '255,200,40', 0.2 + 0.07 * Math.sin(t * 3));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.2 * u, k.conic(t * 1.8, ['#8a6508', '#fff7c2', '#ffd700', '#a67400', '#fffbe6', '#e0a800', '#8a6508']), '#ffb300', 12 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(255,251,230,.75)');
    ctx.save(); ctx.setLineDash([3 * u, 4 * u]); ctx.lineDashOffset = t * 14 * u; k.ring(R + 6.5 * u, k.px(1.6, 0.6), '#ffd700', '#ffb300', 4 * u); ctx.restore();
    k.shine(t, 2.6, 4.2 * u, '255,240,170');
    k.hole();
    // a laurel of gold: six leaves up each side from the foot, a gleam running up them
    const gleam = (t * 0.6) % 1.8;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const q = i / 5;
        const a = Math.PI / 2 - side * (0.25 + q * 1.5);
        const len = k.px(12 - 3 * q, 4.8 - 1.1 * q);
        const lit = Math.max(0, 1 - Math.abs(q - gleam) * 3.5);
        ctx.save(); ctx.translate(...k.at(a, R + 8.5 * u)); ctx.rotate(a - side * (Math.PI / 2 - 0.62 + Math.sin(t * 1.8 + i * 0.6) * 0.07));
        const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#8a6508'); g.addColorStop(0.55, i % 2 ? '#ffd700' : '#e0a800'); g.addColorStop(1, '#fff7c2');
        ctx.fillStyle = g; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 3 * u; k.leaf(len, len * 0.24, 0.45); ctx.fill(); ctx.shadowBlur = 0;
        if (lit > 0) { ctx.fillStyle = `rgba(255,255,255,${(lit * 0.75).toFixed(3)})`; ctx.fill(); }
        ctx.strokeStyle = 'rgba(138,101,8,.6)'; ctx.lineWidth = k.px(0.5, 0.35); ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
        ctx.restore();
      }
    }
    // a sun-star set over the head
    const sy = c - D / 2 - 7 * u + Math.sin(t * 2.2) * 1.2 * u;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, sy, k.px(10, 4), '255,224,102', 0.55 + 0.2 * Math.sin(t * 4));
    ctx.globalCompositeOperation = 'source-over';
    k.star4(c, sy, k.px(9.5, 3.9), t * 0.4, '#fff7c2', 1);
    k.star4(c, sy, k.px(5.5, 2.3), t * 0.4 + Math.PI / 4, '#ffd700', 0.95);
    // gold dust rising
    ctx.globalCompositeOperation = 'lighter';
    for (const p of k.parts(8, 0.08, () => ({ x: c + rnd(-1, 1) * R * 1.6, y: c + R * 1.5, vy: rnd(0.25, 0.7) * u, ph: rnd(TAU), life: 1 }))) {
      p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.3 * u; p.life -= 0.008;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, k.px(2.2, 0.9), '255,224,102', p.life * (0.6 + 0.4 * Math.sin(t * 9 + p.ph)) * k.edge(p.x, p.y));
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(0, 18) * u, ph: rnd(TAU) }), 'glints')) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t + s.ph, '#fff7c2', Math.max(0, Math.sin(t * 2.4 + s.ph)));
    }
  },

  platinum(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(16, -t * 0.3, 38 * u, '125,211,252', 0.26);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '56,189,248', 0.2 + 0.07 * Math.sin(t * 2.6));
    // wings of light: five blades each side, fanned out, beating slowly
    const beat = Math.sin(t * 2.2);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c); ctx.scale(side, 1); ctx.translate(Math.cos(-0.15) * R, Math.sin(-0.15) * R); ctx.rotate(beat * 0.08);
      for (let i = 4; i >= 0; i--) {
        const len = k.px(54 - i * 7, 19.5 - i * 2.5);
        ctx.save(); ctx.rotate(-1.12 + i * 0.32 * (1 - 0.1 * beat));
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,.98)'); g.addColorStop(0.6, 'rgba(125,211,252,.8)'); g.addColorStop(1, 'rgba(56,189,248,.12)');
        ctx.fillStyle = g; k.leaf(len, k.px(4.8, 1.9), 0.3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = k.px(0.7, 0.4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.7, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    k.ring(R + 8 * u, k.px(1.4, 0.6), 'rgba(186,230,253,.8)', '#7dd3fc', 8 * u);
    k.ring(R, 4 * u, k.conic(-t * 2.2, ['#e2e8f0', '#7dd3fc', '#ffffff', '#38bdf8', '#f1f5f9', '#0ea5e9', '#e2e8f0']), '#7dd3fc', 14 * u);
    // two lights chasing each other round the outer ring
    for (let n = 0; n < 2; n++) k.comet(t * 2.4 + n * Math.PI, R + 8 * u, { n: 16, step: 0.06, size: 5.5, rgb: '224,242,254', alpha: 0.85 });
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R - 1.4 * u, k.px(0.7, 0.4), 'rgba(255,255,255,.8)');
    k.shine(t, 3, 4 * u, '186,230,253');
    k.hole();
    // a star of platinum over the head
    const sy = c - D / 2 - 8 * u + Math.sin(t * 2.2) * 1.4 * u;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, sy, k.px(12, 4.6), '186,230,253', 0.6 + 0.2 * Math.sin(t * 4));
    ctx.globalCompositeOperation = 'source-over';
    k.star4(c, sy, k.px(11, 4.4), 0, '#ffffff', 1);
    k.star4(c, sy, k.px(6.5, 2.6), Math.PI / 4, '#bae6fd', 0.9);
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(4, 24) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t + s.ph, '#e0f2fe', Math.max(0, Math.sin(t * 2.6 + s.ph)));
    }
  },

  diamond(k, t) {
    const { ctx, c, u, R, D } = k;
    const hue = (t * 60) % 360;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a0 = t * 0.4 + (i * TAU) / 18;
      const L = R + (i % 2 ? 30 : 48) * u;
      const half = 0.07;
      const h = (hue + i * 20) % 360;
      const g = ctx.createRadialGradient(c, c, R * 0.9, c, c, L);
      g.addColorStop(0, `hsla(${h},95%,70%,.42)`); g.addColorStop(1, `hsla(${h},95%,70%,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, L, a0 - half, a0 + half); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.75, '167,139,250', 0.22 + 0.08 * Math.sin(t * 3));
    k.glow(c, c, R * 1.4, '103,232,249', 0.16);
    k.ring(R, 4 * u, k.conic(t * 3, ['#67e8f9', '#a78bfa', '#f0abfc', '#fde68a', '#6ee7b7', '#67e8f9']), '#c4b5fd', 16 * u);
    ctx.save(); ctx.setLineDash([2 * u, 6 * u]); ctx.lineDashOffset = -t * 20 * u; k.ring(R + 7 * u, k.px(2, 0.8), k.conic(-t * 2, ['#f0abfc', '#67e8f9', '#fde68a', '#a78bfa', '#f0abfc'])); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R - 1.4 * u, k.px(0.7, 0.4), 'rgba(255,255,255,.85)');
    k.shine(t, 3.4, 4 * u);
    k.hole();
    // a cut stone: the table on top, the crown sloping to the girdle, the
    // pavilion down to a point; its facets show when it is big enough
    const gem = (x, y, s, rot, h) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.lineJoin = 'round';
      const g = ctx.createLinearGradient(-s, -s * 0.6, s, s);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, `hsl(${h},95%,80%)`); g.addColorStop(1, `hsl(${(h + 60) % 360},90%,62%)`);
      ctx.fillStyle = g; ctx.shadowColor = `hsl(${h},95%,75%)`; ctx.shadowBlur = s * 0.9;
      ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.62); ctx.lineTo(s * 0.55, -s * 0.62); ctx.lineTo(s, -s * 0.18); ctx.lineTo(0, s); ctx.lineTo(-s, -s * 0.18); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(s * 0.07, 0.4); ctx.stroke();
      if (s > 3.2) {
        ctx.beginPath(); ctx.moveTo(-s, -s * 0.18); ctx.lineTo(s, -s * 0.18);
        ctx.moveTo(-s * 0.55, -s * 0.62); ctx.lineTo(-s * 0.3, -s * 0.18); ctx.lineTo(0, s); ctx.lineTo(s * 0.3, -s * 0.18); ctx.lineTo(s * 0.55, -s * 0.62);
        ctx.moveTo(-s * 0.3, -s * 0.18); ctx.lineTo(0, -s * 0.62); ctx.lineTo(s * 0.3, -s * 0.18);
        ctx.stroke();
      }
      ctx.restore();
    };
    // five stones in orbit, each its own colour, light trailing behind
    for (let i = 0; i < 5; i++) {
      const a = -t * 1.1 + (i * TAU) / 5;
      ctx.globalCompositeOperation = 'lighter';
      k.comet(a, R + 15 * u, { n: 8, step: -0.07, size: 5, rgb: '224,231,255', head: '224,231,255', alpha: 0.45 });
      ctx.globalCompositeOperation = 'source-over';
      const [x, y] = k.at(a, R + 15 * u);
      gem(x, y, k.px(5.8, 2.6), Math.sin(t * 2 + i) * 0.3, (hue + i * 72) % 360);
    }
    // the great stone over the head, and the flare off it
    const gy = c - D / 2 - 9 * u + Math.sin(t * 2.4) * 1.4 * u;
    const flare = 0.6 + 0.4 * Math.sin(t * 3.2);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, gy, k.px(15, 5.5), '233,213,255', 0.5 * flare);
    ctx.fillStyle = `rgba(255,255,255,${(0.85 * flare).toFixed(3)})`;
    k.lens(c - k.px(27, 10) * flare, gy, c + k.px(27, 10) * flare, gy, k.px(1.7, 0.7)); ctx.fill();
    k.lens(c, gy - k.px(16, 6) * flare, c, gy + k.px(16, 6) * flare, k.px(1.4, 0.6)); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    gem(c, gy, k.px(11.5, 4.8), 0, (hue + 200) % 360);
    // flashes of colour thrown off it
    for (const s of k.fixed(10, () => ({ a: rnd(TAU), r: rnd(2, 30) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(9, 3.2), t * 1.4 + s.ph, `hsl(${Math.round((hue + s.ph * 57) % 360)},95%,85%)`, Math.max(0, Math.sin(t * 3 + s.ph)));
    }
  },

  fire(k, t) {
    const { ctx, c, u, R, S } = k;
    S.sparks ||= [];
    // flame tongues born on the ring, rising and cooling: most of them over
    // the upper half, where they are bigger and climb faster
    if (!k.still) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() < 0.62 ? rnd(-Math.PI, 0) : rnd(TAU);
        const up = Math.max(0, -Math.sin(a)); // 1 right at the top, 0 at the sides and below
        S.parts.push({
          x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, vx: Math.cos(a) * 0.25 * u + rnd(-0.4, 0.4) * u,
          vy: -rnd(0.8, 2.1) * u * (0.75 + up * 0.95), life: 1, d: rnd(0.02, 0.045),
          // never smaller than a couple of px, so a 28px avatar still shows flames
          s: Math.max(rnd(7, 15) * u * (1 + up * 0.5), 2.2 + up * 1.6), up,
        });
      }
      // bright sparks shooting up, past the top of the canvas
      if (Math.random() < 0.3) {
        const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15);
        S.sparks.push({ x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, vx: rnd(-0.5, 0.5) * u, vy: -rnd(2.6, 4.6) * u - 0.25, life: 1, d: rnd(0.025, 0.05) });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    // the halo flickers like a fire, not a lamp
    k.glow(c, c - 6 * u, R * 1.85, '255,70,0', 0.2 + 0.09 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23 + 1));
    if (k.still) {
      // a still flame: tongues standing over the upper half
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.34;
        const lift = (i % 2 ? 5 : 11) * u;
        k.glow(c + Math.cos(a) * (R + 3 * u), c + Math.sin(a) * (R + 3 * u) - lift, Math.max((i % 2 ? 10 : 13) * u, 3.4), i % 2 ? '255,150,30' : '255,64,8', 0.36);
      }
    } else {
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.14, 0.14) * u; p.vy *= 0.992; p.life -= p.d;
        const heat = p.life;
        const rgb = heat > 0.8 ? '255,246,200' : heat > 0.5 ? '255,160,36' : heat > 0.22 ? '255,64,8' : '140,20,6';
        const rad = p.s * (0.4 + heat * 0.7);
        // fades out before the top of the canvas, so a tall flame has no flat cut
        const edge = Math.max(0, Math.min(1, (p.y - rad) / (k.C * 0.07)));
        k.glow(p.x, p.y, rad, rgb, (0.3 + p.up * 0.14) * heat * edge);
      }
      S.sparks = S.sparks.filter((p) => p.life > 0);
      for (const p of S.sparks) {
        const px = p.x;
        const py = p.y;
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.1, 0.1) * u; p.life -= p.d;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6 * u, 0.9); ctx.strokeStyle = `rgba(255,240,170,${p.life})`; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 5 * u;
        ctx.beginPath(); ctx.moveTo(px - p.vx, py - p.vy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore();
      }
    }
    k.ring(R, 3.4 * u, k.conic(t * 5, ['#fff3c4', '#ffb300', '#ff3d00', '#7f0000', '#ff6d00', '#ffe082', '#fff3c4']), '#ff6d00', 16 * u);
    k.ring(R - 1.4 * u, 1 * u, 'rgba(255,250,210,.9)', '#ffd54f', 6 * u);
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
  },

  thunder(k, t) {
    const { ctx, c, u, R, S } = k;
    S.tick++;
    // arcs jump every few frames; a still picture keeps the first set
    if (k.still ? !S.bolts.length : S.tick % 4 === 0) {
      S.bolts = [];
      for (let b = 0; b < 3; b++) {
        const a0 = rnd(TAU);
        const span = rnd(0.7, 1.9);
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const a = a0 + (span * i) / 16;
          const r = R + 3 * u + rnd(-7, 9) * u;
          pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
        }
        S.bolts.push(pts);
      }
      if (!k.still && Math.random() < 0.45) { // a bolt shooting outwards
        const a = rnd(TAU);
        const pts = [];
        for (let i = 0; i <= 7; i++) {
          const r = R + i * 5.5 * u;
          const aa = a + rnd(-0.12, 0.12);
          pts.push([c + Math.cos(aa) * r, c + Math.sin(aa) * r]);
        }
        S.bolts.push(pts); S.flash = 1;
        for (let i = 0; i < 6; i++) S.parts.push({ x: pts[7][0], y: pts[7][1], vx: rnd(-1.6, 1.6) * u, vy: rnd(-1.6, 1.6) * u, life: 1 });
      }
    }
    S.flash = (S.flash || 0) * 0.86;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '56,189,248', 0.16 + 0.25 * S.flash);
    k.glow(c, c, R * 1.45, '129,140,248', 0.14);
    k.ring(R, 3.2 * u, k.conic(-t * 3, ['#1e3a8a', '#7dd3fc', '#eef2ff', '#6366f1', '#0ea5e9', '#e0f2fe', '#1e3a8a']), '#38bdf8', 14 * u);
    ctx.lineJoin = 'round';
    for (const pts of S.bolts) {
      for (const [w, col, blur] of [[2.6 * u, 'rgba(125,211,252,.9)', 14 * u], [1 * u, '#ffffff', 4 * u]]) {
        ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = blur;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
      }
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) { p.x += p.vx; p.y += p.vy; p.life -= 0.06; k.glow(p.x, p.y, 5 * u, '224,242,254', p.life); }
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
  },

  // 黃金律: a studded ring, coins orbiting
  coin(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(14, t * 0.35, 40 * u, '255,215,0', 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.6, '255,200,40', 0.22 + 0.07 * Math.sin(t * 3));
    ctx.globalCompositeOperation = 'source-over';
    // studded outer ring, counter-rotating
    for (let i = 0; i < 24; i++) {
      const [x, y] = k.at(-t * 0.6 + (i * TAU) / 24, R + 7.5 * u);
      ctx.fillStyle = i % 3 === 0 ? '#fff6c8' : '#c9940a'; ctx.beginPath(); ctx.arc(x, y, k.px(i % 3 === 0 ? 2.1 : 1.3, i % 3 === 0 ? 0.9 : 0.6), 0, TAU); ctx.fill();
    }
    k.ring(R + 7.5 * u, k.px(0.8, 0.4), 'rgba(255,215,0,.45)');
    k.ring(R, 4.2 * u, k.conic(t * 1.6, ['#8a6508', '#fff7c2', '#ffd700', '#a67400', '#fffbe6', '#e0a800', '#8a6508']), '#ffb300', 12 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(255,251,230,.75)');
    k.shine(t, 2.6, 4.2 * u, '255,240,170');
    k.hole();
    // one coin at any point of its spin: the face narrows to the edge and
    // comes back as the other side; a rim, and a star struck in the middle
    const coin = (x, y, r, spin, alpha = 1) => {
      if (alpha <= 0) return;
      const w = Math.cos(spin);
      const rx = Math.max(Math.abs(w) * r, r * 0.14);
      ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 8 * u;
      // its thickness, showing on the side turned away
      ctx.fillStyle = '#8a6508'; ctx.beginPath(); ctx.ellipse(x + (Math.sin(spin) < 0 ? -1 : 1) * r * 0.16 * (1 - Math.abs(w)), y, rx, r, 0, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      const g = ctx.createLinearGradient(x - rx, y - r, x + rx, y + r);
      g.addColorStop(0, '#fffbe6'); g.addColorStop(0.5, w > 0 ? '#ffd700' : '#e0a800'); g.addColorStop(1, '#8a6508');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, r, 0, 0, TAU); ctx.fill();
      if (Math.abs(w) > 0.3) {
        ctx.strokeStyle = 'rgba(138,101,8,.8)'; ctx.lineWidth = Math.max(r * 0.1, 0.4); ctx.beginPath(); ctx.ellipse(x, y, rx * 0.74, r * 0.74, 0, 0, TAU); ctx.stroke();
        ctx.translate(x, y); ctx.scale(Math.abs(w), 1); ctx.fillStyle = w > 0 ? '#fff7c2' : '#a67400'; ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const sa = -Math.PI / 2 + (i * TAU) / 10;
          const sr = r * (i % 2 ? 0.2 : 0.48);
          ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    };
    // three in orbit, flipping
    for (let i = 0; i < 3; i++) {
      const [x, y] = k.at(t * 1.3 + (i * TAU) / 3, R + 17 * u);
      coin(x, y, k.px(8, 3.4), t * 6 + i * 2);
    }
    // and a fountain of them tossed up from below, falling back
    for (const p of k.parts(9, 0.12, () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      return { x: c + side * rnd(0.55, 1.25) * R, y: c + R * 1.75, vx: side * rnd(0, 0.6) * u, vy: -rnd(3, 4.6) * u, spin: rnd(TAU), sv: rnd(0.2, 0.4), z: rnd(0.6, 0.9), life: 1 };
    })) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.085 * u; p.spin += p.sv; p.life -= 0.007;
      if (p.vy > 0 && p.y > c + R * 1.85) p.life = 0;
      if (k.off(p.x, p.y)) coin(p.x, p.y, k.px(6, 2.6) * p.z, p.spin, k.edge(p.x, p.y));
    }
    for (const s of k.fixed(7, () => ({ a: rnd(TAU), r: rnd(-4, 22) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t + s.ph, '#fff7c2', Math.max(0, Math.sin(t * 2.4 + s.ph)));
    }
  },

  king(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(16, t * 0.25, 50 * u, '250,204,21', 0.34);
    k.rays(8, -t * 0.18, 34 * u, '216,180,254', 0.22, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '168,85,247', 0.22 + 0.08 * Math.sin(t * 2.5));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setLineDash([3 * u, 6 * u]); ctx.lineDashOffset = t * 22 * u;
    k.ring(R + 8 * u, k.px(2, 0.8), '#facc15', '#f59e0b', 6 * u); ctx.restore();
    ctx.save(); ctx.setLineDash([1.2 * u, 7 * u]); ctx.lineDashOffset = -t * 16 * u;
    k.ring(R + 13 * u, k.px(1.6, 0.6), '#e9d5ff'); ctx.restore();
    k.ring(R, 4.2 * u, k.conic(t * 2, ['#4c1d95', '#fde68a', '#a855f7', '#fff7cc', '#7c3aed', '#facc15', '#4c1d95']), '#c084fc', 14 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(255,247,204,.8)');
    k.shine(t, 3, 4.2 * u, '253,230,138');
    k.hole();
    // fleurs-de-lis at the foot and to either side
    const fleur = (a) => {
      const s = k.px(10, 4.2);
      ctx.save(); ctx.translate(...k.at(a, R + 5 * u)); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#b45309'); g.addColorStop(0.5, '#facc15'); g.addColorStop(1, '#fff7cc');
      ctx.fillStyle = g; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 5 * u;
      k.leaf(s, s * 0.26, 0.5); ctx.fill();
      for (const turn of [-0.8, 0.8]) { ctx.save(); ctx.rotate(turn); k.leaf(s * 0.72, s * 0.2, 0.6); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = '#a855f7'; ctx.shadowColor = '#a855f7'; ctx.beginPath(); ctx.arc(s * 0.14, 0, Math.max(s * 0.15, 0.7), 0, TAU); ctx.fill();
      ctx.restore();
    };
    fleur(Math.PI / 2); fleur(0.2); fleur(Math.PI - 0.2);
    // the jewels of the realm in orbit: ruby, sapphire, emerald, amethyst
    ['239,68,68', '59,130,246', '16,185,129', '168,85,247'].forEach((rgb, i) => {
      const [x, y] = k.at(t * 0.7 + (i * TAU) / 4 + 0.75, R + 20 * u);
      const r = k.px(3.6, 1.6);
      ctx.globalCompositeOperation = 'lighter';
      k.glow(x, y, r * 2.8, rgb, 0.55 + 0.25 * Math.sin(t * 3 + i * 1.6));
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, `rgb(${rgb})`); g.addColorStop(1, 'rgba(15,10,46,.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    });
    // the crown, floating
    const cy = c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.6 * u;
    k.crown(cy, 50 * u, ['#fff7cc', '#facc15', '#b45309'], '#a855f7');
    k.star4(c, cy - Math.max(50 * u, 11) * 0.62, k.px(7, 2.8), t * 1.5, '#ffffff', 0.5 + 0.5 * Math.sin(t * 3.4));
    for (const s of k.fixed(9, () => ({ a: rnd(TAU), r: rnd(4, 30) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(9, 3.2), t * 1.2 + s.ph, '#fde68a', Math.max(0, Math.sin(t * 2.8 + s.ph)));
    }
  },

  night(k, t) {
    const { ctx, c, u, R, C } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '79,70,229', 0.26 + 0.07 * Math.sin(t * 1.6));
    // two clouds of colour drifting round: a nebula
    {
      const [ax, ay] = k.at(t * 0.15, R + 12 * u);
      const [bx, by] = k.at(t * 0.15 + 2.6, R + 14 * u);
      k.glow(ax, ay, R * 1.1, '168,85,247', 0.14);
      k.glow(bx, by, R, '14,165,233', 0.11);
    }
    const stars = k.fixed(46, () => ({ a: rnd(TAU), r: rnd(3, 30) * u, ph: rnd(TAU), z: rnd(0.6, 1.9) }));
    for (const s of stars) {
      const a = s.a + t * 0.12;
      const al = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + s.ph));
      ctx.fillStyle = `rgba(224,231,255,${al.toFixed(3)})`; ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + s.r), c + Math.sin(a) * (R + s.r), k.px(s.z, 0.5), 0, TAU); ctx.fill();
    }
    // a constellation over the upper left: five stars joined up one line at
    // a time, held a while, then let go
    const CON = [[-2.85, 21], [-2.4, 31], [-2.05, 20], [-1.62, 30], [-1.22, 22]].map(([a, far]) => k.at(a, R + far * u));
    const cq = k.still ? 0.6 : (t / 6) % 1;
    const drawn = Math.min(1, cq / 0.5) * (CON.length - 1);
    const hold = cq < 0.75 ? 1 : 1 - (cq - 0.75) / 0.25;
    ctx.save(); ctx.strokeStyle = `rgba(199,210,254,${(0.7 * hold).toFixed(3)})`; ctx.lineWidth = k.px(0.8, 0.45); ctx.lineCap = 'round';
    for (let i = 0; i < CON.length - 1; i++) {
      const part = Math.max(0, Math.min(1, drawn - i));
      if (part <= 0) break;
      ctx.beginPath(); ctx.moveTo(CON[i][0], CON[i][1]);
      ctx.lineTo(CON[i][0] + (CON[i + 1][0] - CON[i][0]) * part, CON[i][1] + (CON[i + 1][1] - CON[i][1]) * part); ctx.stroke();
    }
    ctx.restore();
    CON.forEach(([x, y], i) => {
      const lit = drawn >= i ? hold : 0.35;
      k.glow(x, y, k.px(4, 1.6), '224,231,255', 0.5 + 0.4 * lit);
    });
    // a shooting star now and then, passing behind the face
    for (const p of k.parts(2, 0.014, () => {
      const side = rnd(-0.9, 0.9) * C * 0.6;
      return { x: c - 0.626 * side + 0.78 * C * 0.8, y: c - 0.78 * side - 0.626 * C * 0.8, gone: 0, life: 1 };
    }, 'shooting')) {
      const v = 7 * u;
      p.x -= 0.78 * v; p.y += 0.626 * v; p.gone += v;
      if (p.gone > C * 1.7) p.life = 0;
      const a = Math.min(1, p.gone / (C * 0.2)) * k.edge(p.x, p.y);
      ctx.fillStyle = `rgba(224,231,255,${(0.8 * a).toFixed(3)})`;
      k.lens(p.x, p.y, p.x + 0.78 * 26 * u, p.y - 0.626 * 26 * u, k.px(1.6, 0.7)); ctx.fill();
      k.glow(p.x, p.y, k.px(4, 1.6), '255,255,255', a);
    }
    k.ring(R, 3.4 * u, k.conic(t * 0.8, ['#0b1026', '#818cf8', '#e0e7ff', '#312e81', '#0b1026', '#c7d2fe', '#0b1026']), '#818cf8', 14 * u);
    // a comet going round, its tail behind it
    if (!k.still) k.comet(t * 1.7, R + 13 * u, { n: 22, step: 0.045, size: 6, rgb: '199,210,254', alpha: 0.8 });
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R - 1.3 * u, k.px(0.7, 0.4), 'rgba(224,231,255,.7)');
    k.hole();
    // the crescent moon, a halo round it
    const mr = Math.max(11 * u, 4.6); // never a speck, even on a 28px avatar
    const mx = c + Math.cos(-0.85) * (R + Math.max(9 * u, mr * 0.8));
    const my = c + Math.sin(-0.85) * (R + Math.max(9 * u, mr * 0.8));
    ctx.globalCompositeOperation = 'lighter';
    k.glow(mx, my, mr * 2.6, '254,249,195', 0.2 + 0.06 * Math.sin(t * 1.4));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.strokeStyle = 'rgba(254,249,195,.28)'; ctx.lineWidth = k.px(0.8, 0.4); ctx.beginPath(); ctx.arc(mx, my, mr * 1.75, 0, TAU); ctx.stroke();
    ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 14 * u; ctx.fillStyle = '#fef9c3';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.arc(mx + mr * 0.5, my - mr * 0.22, mr * 0.84, 0, TAU, true); ctx.fill('evenodd');
    ctx.restore();
    k.star4(mx + mr * 0.55, my - mr * 0.1, mr * 0.42, t, '#ffffff', 0.6 + 0.4 * Math.sin(t * 2.6));
    for (const s of stars.slice(0, 5)) {
      k.star4(c + Math.cos(s.a - t * 0.2) * (R + s.r), c + Math.sin(s.a - t * 0.2) * (R + s.r), k.px(7, 2.6), t + s.ph, '#e0e7ff', Math.max(0, Math.sin(t * 1.7 + s.ph)));
    }
  },

  frost(k, t) {
    const { ctx, c, u, R, S } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '125,211,252', 0.2 + 0.06 * Math.sin(t * 2));
    // ice crystals growing out of the ring: each with a ridge of light down
    // it, the big ones branching
    const shard = (bx, by, a, len, hw) => {
      const tx = bx + Math.cos(a) * len;
      const ty = by + Math.sin(a) * len;
      const g = ctx.createLinearGradient(bx, by, tx, ty); g.addColorStop(0, 'rgba(240,249,255,.95)'); g.addColorStop(0.6, 'rgba(125,211,252,.75)'); g.addColorStop(1, 'rgba(56,189,248,.05)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * hw, by + Math.cos(a) * hw); ctx.lineTo(tx, ty); ctx.lineTo(bx + Math.sin(a) * hw, by - Math.cos(a) * hw); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = k.px(0.6, 0.35); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * len * 0.8, by + Math.sin(a) * len * 0.8); ctx.stroke();
      return [tx, ty];
    };
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16 + t * 0.12;
      const len = (i % 2 ? 13 : 25) * u + Math.sin(t * 2 + i) * 3 * u;
      const [bx, by] = k.at(a, R + 1 * u);
      const [tx, ty] = shard(bx, by, a, len, k.px(i % 2 ? 2.6 : 3.8, 1));
      if (i % 2) continue;
      // two smaller crystals off its sides
      const [mx, my] = k.at(a, R + 1 * u + len * 0.42);
      shard(mx, my, a + 0.85, len * 0.38, k.px(1.6, 0.6));
      shard(mx, my, a - 0.85, len * 0.38, k.px(1.6, 0.6));
      k.star4(tx, ty, k.px(5, 2), t + i, '#ffffff', Math.max(0, Math.sin(t * 3 + i * 1.7)));
    }
    k.ring(R, 3.4 * u, k.conic(-t * 0.9, ['#e0f2fe', '#38bdf8', '#f0f9ff', '#0ea5e9', '#bae6fd', '#ffffff', '#e0f2fe']), '#7dd3fc', 14 * u);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R - 1.3 * u, k.px(0.7, 0.4), 'rgba(255,255,255,.85)');
    k.hole();
    if (k.still) return;
    // snow coming down: the bigger flakes have six arms and turn
    if (S.parts.length < 26 && Math.random() < 0.5) S.parts.push({ x: c + rnd(-1, 1) * R * 1.7, y: c - R * 1.9, vy: rnd(0.35, 0.9) * u, ph: rnd(TAU), z: rnd(1, 2.6) });
    S.parts = S.parts.filter((p) => p.y < c + R * 1.9);
    ctx.save(); ctx.strokeStyle = 'rgba(240,249,255,.95)'; ctx.fillStyle = 'rgba(240,249,255,.9)'; ctx.shadowColor = '#bae6fd'; ctx.shadowBlur = 4 * u; ctx.lineCap = 'round';
    for (const p of S.parts) {
      p.y += p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.35 * u;
      // never across the face
      if (!k.off(p.x, p.y)) continue;
      ctx.globalAlpha = k.edge(p.x, p.y);
      if (p.z < 1.8) { ctx.beginPath(); ctx.arc(p.x, p.y, k.px(p.z, 0.6), 0, TAU); ctx.fill(); continue; }
      const arm = k.px(p.z * 1.7, 1.7);
      ctx.lineWidth = k.px(0.7, 0.45); ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const fa = t * 1.2 + p.ph + (i * Math.PI) / 3;
        ctx.moveTo(p.x - Math.cos(fa) * arm, p.y - Math.sin(fa) * arm); ctx.lineTo(p.x + Math.cos(fa) * arm, p.y + Math.sin(fa) * arm);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  abyss(k, t) {
    const { ctx, c, u, R, S } = k;
    // smoke swirling off the ring: dark wisps, and more glowing ones (the
    // dark ones vanish on a dark page)
    if (!k.still) {
      for (let i = 0; i < 4; i++) {
        S.parts.push({
          a: rnd(TAU), r: R + rnd(-2, 4) * u, va: rnd(0.02, 0.05), vr: rnd(0.12, 0.42) * u, life: 1, d: rnd(0.012, 0.024),
          s: Math.max(rnd(12, 24) * u, 4), light: Math.random() < 0.62, pink: Math.random() < 0.4,
        });
      }
    }
    k.glow(c, c, R * 1.75, '46,16,101', 0.55);
    if (!k.still) {
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.a += p.va; p.r += p.vr; p.life -= p.d;
        const x = c + Math.cos(p.a) * p.r;
        const y = c + Math.sin(p.a) * p.r;
        if (p.light) {
          ctx.globalCompositeOperation = 'lighter'; k.glow(x, y, p.s * 0.7, p.pink ? '232,121,249' : '167,139,250', 0.55 * p.life); ctx.globalCompositeOperation = 'source-over';
        } else k.glow(x, y, p.s, '20,6,48', 0.6 * p.life);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    const pulse = Math.abs(Math.sin(t * 2.6));
    k.glow(c, c, R * 1.45, '147,51,234', 0.22 + 0.16 * pulse);
    // runes lighting up one after another (never thinner than a good px)
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10 - t * 0.3;
      const al = Math.max(0.3, Math.sin(t * 4 - i * 0.63));
      ctx.save(); ctx.lineWidth = Math.max(2.6 * u, 1.3); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(233,213,255,${al})`; ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 8 * u;
      ctx.beginPath(); ctx.arc(c, c, R + Math.max(9 * u, 3.4), a, a + 0.34); ctx.stroke(); ctx.restore();
    }
    k.ring(R, 3.6 * u, k.conic(-t * 4, ['#0f0a2e', '#a78bfa', '#1e1b4b', '#c4b5fd', '#0f0a2e', '#7c3aed', '#0f0a2e']), '#7c3aed', 16 * u);
    // the inner edge, pulsing bright
    k.ring(R - 1.3 * u, Math.max(1.1 * u, 0.7), `rgba(240,220,255,${0.5 + 0.45 * pulse})`, '#e879f9', 7 * u);
    // souls: bright sparks spiralling outward, each with a short trail
    if (!k.still) {
      for (let n = 0; n < 3; n++) {
        for (let j = 0; j < 9; j++) {
          const q = (t * 0.5 + n / 3 - j * 0.014 + 1) % 1; // 0 on the ring → 1 far out
          const a = t * 2.2 + (n * TAU) / 3 + q * 3.4;
          const r = R + 2 * u + q * 30 * u;
          const fade = Math.sin(q * Math.PI) * (1 - j / 9);
          k.glow(c + Math.cos(a) * r, c + Math.sin(a) * r, Math.max((j ? 3.4 - j * 0.25 : 4.2) * u, j ? 1 : 1.5), j ? '232,121,249' : '255,255,255', (j ? 0.6 : 1) * fade);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
  },

  tide(k, t) {
    const { ctx, c, u, R, S } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.75, '14,165,233', 0.22 + 0.06 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    // the sea round the ring: a far body of water and a near one, and a
    // swell travelling round the near one
    const swell = t * 0.9;
    const surf = (far, a) => {
      const d = Math.atan2(Math.sin(a - swell), Math.cos(a - swell));
      const chop = Math.sin(a * (far ? 7 : 5) + t * (far ? -1.8 : 2.4)) * (far ? 2.2 : 2.6) + Math.sin(a * 3 - t * 1.3) * 1.6;
      return R + ((far ? 15 : 8) + chop + (far ? 0 : 9 * Math.exp(-d * d * 3.2))) * u;
    };
    for (const far of [true, false]) {
      const g = ctx.createRadialGradient(c, c, R, c, c, R + 22 * u);
      if (far) {
        g.addColorStop(0, 'rgba(12,74,110,.5)'); g.addColorStop(1, 'rgba(56,189,248,.28)');
      } else {
        g.addColorStop(0, 'rgba(8,47,73,.9)'); g.addColorStop(0.45, 'rgba(2,132,199,.8)'); g.addColorStop(1, 'rgba(103,232,249,.85)');
      }
      ctx.fillStyle = g; ctx.beginPath();
      for (let a = 0; a <= TAU + 0.04; a += 0.04) {
        const [x, y] = k.at(a, surf(far, a));
        if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      // foam along the crest
      ctx.save(); ctx.strokeStyle = far ? 'rgba(186,230,253,.45)' : 'rgba(240,249,255,.95)'; ctx.lineWidth = k.px(far ? 0.8 : 1.3, 0.5);
      ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 5 * u; ctx.stroke(); ctx.restore();
    }
    k.ring(R, 3.6 * u, k.conic(t * 1.4, ['#0c4a6e', '#22d3ee', '#e0f2fe', '#0284c7', '#67e8f9', '#0369a1', '#0c4a6e']), '#22d3ee', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.7, 0.4), 'rgba(224,242,254,.8)');
    k.shine(t, 2.2, 3.6 * u, '207,250,254');
    k.hole();
    // white water on top of the swell
    ctx.globalCompositeOperation = 'lighter';
    for (let j = -2; j <= 2; j++) {
      const a = swell + j * 0.13;
      const [x, y] = k.at(a, surf(false, a) + 1 * u);
      k.glow(x, y, k.px(3.4 - Math.abs(j) * 0.6, 1.3), '240,249,255', 0.8 - Math.abs(j) * 0.18);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (k.still) return;
    // spray thrown off the swell, falling back
    if (Math.random() < 0.5) {
      const a = swell + rnd(-0.3, 0.3);
      const [x, y] = k.at(a, surf(false, a));
      S.parts.push({ x, y, vx: Math.cos(a) * rnd(0.4, 1.3) * u, vy: Math.sin(a) * rnd(0.4, 1.3) * u - rnd(0.3, 1.2) * u, life: 1, z: rnd(1, 2.6) });
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.07 * u; p.life -= 0.025;
      if (!k.off(p.x, p.y)) continue;
      ctx.fillStyle = `rgba(207,250,254,${Math.max(0, p.life).toFixed(3)})`; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, k.px(p.z, 0.6), 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
  },

  // ── 主題框, the rest of the families (one each) ──────────────────────

  // 累積給出: cherry blossoms on a branch, petals on the wind
  petal(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '244,114,182', 0.2 + 0.05 * Math.sin(t * 1.8));
    // lights out of focus, drifting behind
    for (const b of k.fixed(5, (i) => ({ a: (i * TAU) / 5 + rnd(0.8), r: rnd(14, 32), z: rnd(8, 13), ph: rnd(TAU) }), 'bokeh')) {
      const [x, y] = k.at(b.a + t * 0.1, R + b.r * u);
      k.glow(x, y, k.px(b.z, 3), '251,207,232', 0.16 + 0.1 * Math.sin(t * 1.3 + b.ph));
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.1, ['#831843', '#fbcfe8', '#ec4899', '#fff1f2', '#be185d', '#f9a8d4', '#831843']), '#f472b6', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(255,241,242,.75)');
    k.shine(t, 2.1, 4 * u, '252,231,243');
    k.hole();
    // one petal, notched at the tip and paler towards it; `flip` turns it over
    const petal = (x, y, rot, s, alpha, flip = 1) => {
      if (alpha <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, flip || 0.01); ctx.globalAlpha = Math.min(1, alpha);
      const g = ctx.createLinearGradient(0, 0, s, 0); g.addColorStop(0, '#f472b6'); g.addColorStop(0.5, '#fbcfe8'); g.addColorStop(1, '#fff1f2');
      ctx.fillStyle = g; ctx.shadowColor = '#ec4899'; ctx.shadowBlur = 4 * u;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(s * 0.25, -s * 0.62, s * 0.9, -s * 0.52, s, -s * 0.15);
      ctx.lineTo(s * 0.84, 0); ctx.lineTo(s, s * 0.15);
      ctx.bezierCurveTo(s * 0.9, s * 0.52, s * 0.25, s * 0.62, 0, 0);
      ctx.fill(); ctx.restore();
    };
    // a branch along the lower left and a twig at the upper right, in bloom
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = k.px(2.2, 0.9); ctx.shadowColor = '#431407'; ctx.shadowBlur = 2 * u;
    ctx.beginPath(); ctx.arc(c, c, R + 8 * u, 1.75, 3.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, R + 8 * u, -1.05, -0.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(253,186,116,.5)'; ctx.lineWidth = k.px(0.7, 0.4); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(c, c, R + 8.6 * u, 1.8, 3.7); ctx.stroke(); ctx.restore();
    for (const [a, size, ph] of [[2.0, 10.5, 0], [2.75, 8, 1.7], [3.45, 9, 3.1], [-0.72, 9, 4.4]]) {
      const s = k.px(size, size * 0.42) * (1 + 0.05 * Math.sin(t * 2 + ph));
      const [x, y] = k.at(a, R + 9 * u);
      const rot = ph + Math.sin(t * 1.1 + ph) * 0.18;
      for (let i = 0; i < 5; i++) petal(x, y, rot + (i * TAU) / 5, s, 1);
      ctx.save(); ctx.fillStyle = '#be185d'; ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 3 * u;
      for (let i = 0; i < 5; i++) {
        const sa = rot + 0.63 + (i * TAU) / 5;
        ctx.beginPath(); ctx.arc(x + Math.cos(sa) * s * 0.34, y + Math.sin(sa) * s * 0.34, Math.max(s * 0.09, 0.5), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // petals caught in a spiral round the ring
    for (let i = 0; i < 9; i++) {
      const q = (t * 0.16 + i / 9) % 1;
      const a = t * 0.7 + i * 2.4 + q * 2.2;
      const [x, y] = k.at(a, R + (5 + q * 36) * u);
      petal(x, y, a + t * 3 + i, k.px(5.5, 2.3) * (0.7 + 0.5 * q), Math.sin(q * Math.PI) * 0.95, Math.cos(t * 4 + i * 1.3));
    }
    // and the ones coming down, blown sideways now and then
    const wind = Math.sin(t * 0.5) * 0.5 * u;
    for (const p of k.parts(16, 0.2, () => ({ x: c + rnd(-1, 1) * R * 1.9, y: c - R * 2, vy: rnd(0.45, 1) * u, ph: rnd(TAU), z: rnd(0.8, 1.3), life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 1.6 + p.ph) * 0.6 * u + wind; p.life -= 0.005;
      if (p.y > c + R * 2.1) p.life = 0;
      if (k.off(p.x, p.y)) petal(p.x, p.y, t * 2 + p.ph, k.px(5, 2) * p.z, Math.min(1, p.life * 4) * k.edge(p.x, p.y), Math.cos(t * 3 + p.ph));
    }
  },

  // 單場大贏: a fireworks show
  firework(k, t) {
    const { ctx, c, u, R, S } = k;
    S.flash = (S.flash || 0) * 0.86;
    k.rays(12, t * 0.3, 38 * u, '250,204,21', 0.16);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '192,38,211', 0.2 + 0.06 * Math.sin(t * 2.4) + 0.22 * S.flash);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 2.2, ['#4a044e', '#f5d0fe', '#d946ef', '#fef08a', '#a21caf', '#facc15', '#4a044e']), '#d946ef', 14 * u);
    ctx.save(); ctx.setLineDash([1.4 * u, 5 * u]); ctx.lineDashOffset = -t * 12 * u; k.ring(R + 6.5 * u, k.px(1.4, 0.6), 'rgba(253,224,71,.8)'); ctx.restore();
    k.shine(t, 3.4, 4 * u, '250,232,255');
    k.hole();
    // a shell's [bright core, colour]
    const PAL = [['255,244,180', '250,204,21'], ['255,214,235', '244,63,160'], ['210,250,255', '34,211,238'], ['225,255,215', '74,222,128'], ['240,225,255', '167,139,250']];
    const lw = k.px(1.9, 0.9);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    if (k.still) {
      // three shells caught in mid-air
      for (const [a, far, q, pal] of [[-2.35, 24, 0.8, 0], [-0.7, 21, 0.62, 1], [1.35, 23, 0.7, 2]]) {
        const [bx, by] = k.at(a, R + far * u);
        k.glow(bx, by, k.px(10, 4), PAL[pal][1], 0.35);
        for (let i = 0; i < 16; i++) {
          const sa = (i * TAU) / 16 + pal;
          const r1 = q * (i % 2 ? 17 : 26) * u;
          const ex = bx + Math.cos(sa) * r1;
          const ey = by + Math.sin(sa) * r1 + q * 2 * u;
          ctx.lineWidth = lw; ctx.strokeStyle = `rgba(${PAL[pal][1]},.85)`;
          ctx.beginPath(); ctx.moveTo(bx + Math.cos(sa) * r1 * 0.3, by + Math.sin(sa) * r1 * 0.3); ctx.lineTo(ex, ey); ctx.stroke();
          k.glow(ex, ey, k.px(2.6, 1.1), PAL[pal][0], 1);
        }
      }
      ctx.restore();
      return;
    }
    S.shells ||= [];
    S.next ||= 0;
    if (t >= S.next && S.shells.length < 5) {
      S.next = t + rnd(0.25, 0.55);
      const [tx, ty] = k.at(rnd(TAU), R + rnd(17, 27) * u);
      S.shells.push({ x: tx + rnd(-5, 5) * u, y: ty + rnd(20, 28) * u, tx, ty, q: 0, pal: PAL[Math.floor(rnd(PAL.length))], kind: Math.floor(rnd(3)) });
    }
    S.shells = S.shells.filter((s) => s.q < 1);
    for (const s of S.shells) {
      // the shell climbing, a gold tail behind it
      const e0 = 1 - (1 - s.q) ** 2;
      s.q = Math.min(1, s.q + 0.07);
      const e1 = 1 - (1 - s.q) ** 2;
      const x0 = s.x + (s.tx - s.x) * e0;
      const y0 = s.y + (s.ty - s.y) * e0;
      const x1 = s.x + (s.tx - s.x) * e1;
      const y1 = s.y + (s.ty - s.y) * e1;
      if (k.off(x1, y1)) {
        ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(253,230,138,.8)';
        ctx.beginPath(); ctx.moveTo(x0 - (x1 - x0), y0 - (y1 - y0)); ctx.lineTo(x1, y1); ctx.stroke();
        k.glow(x1, y1, k.px(3, 1.2), '255,255,255', 0.9);
      }
      if (s.q < 1) continue;
      // …and bursting: a round one, a ring with a white heart, or a gold willow
      S.flash = 1;
      const willow = s.kind === 2;
      const n = willow ? 20 : 30;
      const v = Math.max(rnd(1.9, 2.5) * u, 0.8);
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n + rnd(-0.08, 0.08);
        const sp = v * (s.kind === 1 ? (i % 2 ? 1 : 0.55) : rnd(0.45, 1));
        S.parts.push({
          x: s.tx, y: s.ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1,
          d: willow ? rnd(0.011, 0.016) : rnd(0.016, 0.026), g: (willow ? 0.045 : 0.02) * u,
          core: willow ? '255,244,180' : s.pal[0],
          rgb: willow ? '250,204,21' : (s.kind === 1 && i % 2 === 0 ? '255,255,255' : s.pal[1]),
        });
      }
      S.parts.push({ x: s.tx, y: s.ty, life: 1, d: 0.12, pop: true, rgb: s.pal[1] });
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) {
      if (p.pop) { k.glow(p.x, p.y, k.px(24, 9) * (1.2 - p.life * 0.5), p.rgb, 0.7 * p.life); p.life -= p.d; continue; }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy = p.vy * 0.95 + p.g; p.life -= p.d;
      if (p.life <= 0 || !k.off(p.x, p.y)) continue;
      // going out, the sparks crackle
      const a = (p.life > 0.35 ? p.life : p.life * 2 * (0.35 + 0.65 * Math.random())) * k.edge(p.x, p.y);
      k.spark({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: a }, p.rgb, lw, 8);
      k.glow(p.x, p.y, k.px(3.4, 1.4), p.core, Math.min(1, a * 1.3));
    }
    ctx.restore();
  },

  // 單場大給: a meteor shower across a night sky
  meteor(k, t) {
    const { ctx, c, u, R, C, S } = k;
    // they fall to the lower left
    const DX = -0.78;
    const DY = 0.626;
    S.dust ||= [];
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.95, '67,56,202', 0.3 + 0.06 * Math.sin(t * 1.5));
    k.glow(c - 14 * u, c + 10 * u, R * 1.2, '14,165,233', 0.1);
    const stars = k.fixed(30, () => ({ a: rnd(TAU), r: rnd(4, 48), ph: rnd(TAU), z: rnd(0.6, 1.6) }), 'stars');
    for (const s of stars) {
      const [x, y] = k.at(s.a, R + s.r * u);
      ctx.fillStyle = `rgba(224,231,255,${(0.3 + 0.7 * Math.max(0, Math.sin(t * 2.2 + s.ph))).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, k.px(s.z, 0.5), 0, TAU); ctx.fill();
    }
    // one meteor: a hot head, and a tail narrowing to nothing behind it
    const meteor = (x, y, len, w, a) => {
      if (a <= 0) return;
      for (const [wide, far, rgb, al] of [[w, 1, '129,140,248', 0.5], [w * 0.5, 0.7, '199,210,254', 0.8], [w * 0.2, 0.45, '255,255,255', 1]]) {
        const ex = x - DX * len * far;
        const ey = y - DY * len * far;
        const g = ctx.createLinearGradient(x, y, ex, ey);
        g.addColorStop(0, `rgba(${rgb},${(al * a).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(x - DY * wide, y + DX * wide); ctx.lineTo(x + DY * wide, y - DX * wide); ctx.closePath(); ctx.fill();
      }
      k.glow(x, y, w * 3.4, '129,140,248', 0.55 * a);
      k.glow(x, y, w * 1.5, '255,255,255', a);
    };
    if (k.still) {
      for (const [a, far, len, w] of [[-2.55, 22, 30, 2.4], [-0.5, 34, 24, 1.8], [1.05, 26, 34, 2.8], [2.6, 36, 20, 1.6]]) {
        const [x, y] = k.at(a, R + far * u);
        meteor(x, y, len * u, k.px(w, 0.9), 0.95);
      }
    }
    // they pass BEHIND the face: each runs straight across the canvas
    for (const p of k.parts(8, 0.11, () => {
      const big = Math.random() < 0.2;
      const side = rnd(-0.95, 0.95) * C * 0.62;
      return {
        x: c - DY * side - DX * C * 0.8, y: c + DX * side - DY * C * 0.8, v: rnd(4.5, 7.5) * u * (big ? 0.8 : 1),
        len: rnd(26, 42) * u * (big ? 1.5 : 1), w: big ? k.px(4.2, 1.8) : k.px(rnd(2, 3), 1), big, gone: 0, life: 1,
      };
    })) {
      p.x += DX * p.v; p.y += DY * p.v; p.gone += p.v;
      if (p.gone > C * 1.7) p.life = 0;
      meteor(p.x, p.y, p.len, p.w, Math.min(1, p.gone / (C * 0.2)) * k.edge(p.x, p.y));
      // a big one sheds glitter
      if (p.big && Math.random() < 0.6) S.dust.push({ x: p.x + rnd(-2, 2) * u, y: p.y + rnd(-2, 2) * u, life: 1, ph: rnd(TAU) });
    }
    S.dust = S.dust.filter((d) => d.life > 0);
    for (const d of S.dust) {
      d.life -= 0.03; d.y += 0.15 * u;
      k.star4(d.x, d.y, k.px(4.5, 1.8), d.ph, '#e0e7ff', d.life * (0.5 + 0.5 * Math.sin(t * 20 + d.ph)));
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.4, ['#1e1b4b', '#c7d2fe', '#6366f1', '#fde68a', '#312e81', '#a5b4fc', '#1e1b4b']), '#6366f1', 14 * u);
    ctx.save(); ctx.setLineDash([1 * u, 5 * u]); k.ring(R + 7 * u, k.px(1.3, 0.6), 'rgba(199,210,254,.75)'); ctx.restore();
    k.shine(t, 2.5, 4 * u, '224,231,255');
    k.hole();
    for (const s of stars.slice(0, 5)) {
      const [x, y] = k.at(s.a, R + s.r * u);
      k.star4(x, y, k.px(7, 2.6), t + s.ph, '#e0e7ff', Math.max(0, Math.sin(t * 1.8 + s.ph)));
    }
  },

  // 穩定型: two koi circling each other in still water
  zen(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '20,184,166', 0.2 + 0.04 * Math.sin(t * 1.2));
    // slow ripples spreading over the water
    for (let i = 0; i < 4; i++) {
      const q = (t * 0.16 + i / 4) % 1;
      k.ring(R + (3 + q * 42) * u, k.px(0.5 + 1.6 * (1 - q), 0.5), `rgba(153,246,228,${(0.5 * (1 - q) ** 1.5).toFixed(3)})`);
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 3.8 * u, k.conic(t * 0.5, ['#042f2e', '#99f6e4', '#0d9488', '#f0fdfa', '#115e59', '#5eead4', '#042f2e']), '#2dd4bf', 12 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(240,253,250,.7)');
    k.shine(t, 1.2, 3.8 * u, '204,251,241');
    k.hole();
    const bw = k.px(5.4, 2.2); // half the body's width
    const orbit = R + Math.max(13.5 * u, bw + 2.6);
    const N = 14;
    const step = (bw * 6.6) / N / orbit; // a fish is some 6.6 half-widths long
    const KOI = [
      { body: '#f8fafc', under: '#ccfbf1', patch: '#ef4444', fin: 'rgba(240,253,250,.72)', glow: '#99f6e4' },
      { body: '#0f3f3c', under: '#5eead4', patch: '#fbbf24', fin: 'rgba(94,234,212,.62)', glow: '#2dd4bf' },
    ];
    KOI.forEach((koi, n) => {
      const head = t * 0.55 + n * Math.PI;
      // its spine: points back along the orbit, swaying more towards the tail
      const pts = [];
      for (let j = 0; j < N; j++) {
        const s = j / (N - 1);
        const [x, y] = k.at(head - j * step, orbit + Math.sin(t * 5 - j * 0.55 + n * 2) * 2.6 * u * s ** 1.3);
        pts.push([x, y, bw * (s < 0.2 ? 0.75 + 1.25 * s : 1 - 0.76 * ((s - 0.2) / 0.8) ** 1.1)]);
      }
      const dir = (a, b) => Math.atan2(pts[a][1] - pts[b][1], pts[a][0] - pts[b][0]);
      const fin = (j, rot, len, hw) => {
        ctx.save(); ctx.translate(pts[j][0], pts[j][1]); ctx.rotate(rot); ctx.fillStyle = koi.fin; ctx.shadowColor = koi.glow; ctx.shadowBlur = 4 * u;
        k.leaf(len, hw, 0.6); ctx.fill(); ctx.restore();
      };
      // rings in the water where it has just been
      for (let m = 0; m < 2; m++) {
        const q = (t * 0.9 + m / 2 + n * 0.3) % 1;
        const [x, y] = k.at(head - (N + 1 + q * 5) * step, orbit);
        ctx.save(); ctx.strokeStyle = `rgba(153,246,228,${(0.5 * (1 - q)).toFixed(3)})`; ctx.lineWidth = k.px(0.8, 0.5);
        ctx.beginPath(); ctx.arc(x, y, bw * (0.5 + q * 1.6), 0, TAU); ctx.stroke(); ctx.restore();
      }
      // fins: the two lobes of the tail, wagging, and one at each shoulder
      const back = dir(N - 1, N - 3);
      const wag = Math.sin(t * 5 - N * 0.55 + n * 2) * 0.3;
      fin(N - 1, back + 0.42 + wag, bw * 2.4, bw * 0.75);
      fin(N - 1, back - 0.42 + wag, bw * 2.4, bw * 0.75);
      const along = dir(4, 2);
      fin(3, along + 1.05, bw * 1.8, bw * 0.55);
      fin(3, along - 1.05, bw * 1.8, bw * 0.55);
      // the body, tail to head: a rim of light under it, then its colour
      ctx.save(); ctx.shadowColor = koi.glow; ctx.shadowBlur = 6 * u; ctx.fillStyle = koi.under;
      for (let j = N - 1; j >= 0; j--) { ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], pts[j][2] + Math.max(0.7 * u, 0.5), 0, TAU); ctx.fill(); }
      ctx.shadowBlur = 0; ctx.fillStyle = koi.body;
      for (let j = N - 1; j >= 0; j--) { ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], pts[j][2], 0, TAU); ctx.fill(); }
      // its markings
      ctx.fillStyle = koi.patch;
      for (const [j, off, z] of [[2, 0.2, 0.62], [5, -0.25, 0.6], [6, 0.1, 0.5], [9, 0.15, 0.62]]) {
        ctx.beginPath(); ctx.arc(pts[j][0] + off * pts[j][2], pts[j][1] - off * pts[j][2], pts[j][2] * z, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
    for (const s of k.fixed(4, () => ({ a: rnd(TAU), r: rnd(20, 34), ph: rnd(TAU) }))) {
      const [x, y] = k.at(s.a, R + s.r * u);
      k.star4(x, y, k.px(6, 2.4), t + s.ph, '#ccfbf1', Math.max(0, Math.sin(t * 1.6 + s.ph)) * 0.8);
    }
  },

  // 人氣目標: spirit fires circling in a cold fog
  ghost(k, t) {
    const { ctx, c, u, R, S } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '8,145,178', 0.2 + 0.07 * Math.sin(t * 1.3));
    // the fog, rolling both ways
    for (let i = 0; i < 8; i++) {
      const [x, y] = k.at((i * TAU) / 8 + t * 0.2 * (i % 2 ? 1 : -1), R + (12 + 6 * Math.sin(t * 0.9 + i * 1.7)) * u);
      k.glow(x, y, k.px(15 + 4 * Math.sin(t * 1.4 + i), 5), i % 2 ? '71,85,105' : '14,116,144', 0.2);
    }
    // a pale echo of the ring, drifting off
    const echo = (t * 0.25) % 1;
    k.ring(R + echo * 32 * u, k.px(1.2, 0.6), `rgba(165,243,252,${(0.4 * (1 - echo) ** 2).toFixed(3)})`);
    ctx.globalCompositeOperation = 'source-over';
    // the ring itself flickers, as if not quite here
    const here = 0.74 + 0.26 * Math.sin(t * 3.1) * Math.sin(t * 1.3);
    ctx.save(); ctx.globalAlpha = here;
    k.ring(R, 3.8 * u, k.conic(-t * 0.9, ['#0f172a', '#e2e8f0', '#475569', '#a5f3fc', '#1e293b', '#67e8f9', '#0f172a']), '#22d3ee', 16 * u);
    ctx.restore();
    k.ring(R - 1.3 * u, k.px(0.9, 0.5), `rgba(236,254,255,${(0.3 + 0.45 * here).toFixed(3)})`, '#a5f3fc', 6 * u);
    k.shine(t, 1.9, 3.8 * u, '236,254,255');
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    // three spirit fires going round, one against the others; each burns
    // upwards as it goes
    const heads = [];
    for (let i = 0; i < 3; i++) {
      const dir = i === 1 ? -1 : 1;
      const a = t * (0.8 + i * 0.22) * dir + i * 2.1;
      const rr = R + (13 + 5 * Math.sin(t * 1.3 + i * 2)) * u;
      const [x, y] = k.at(a, rr);
      heads.push([x, y]);
      if (k.still) {
        k.comet(a, rr, { n: 16, step: 0.075 * dir, size: 8, rgb: i % 2 ? '165,243,252' : '103,232,249', alpha: 0.8 });
        for (let j = 1; j < 5; j++) k.glow(x + Math.sin(j * 2 + i) * 1.5 * u, y - j * 3.2 * u, k.px(6.5 - j, 2), j > 2 ? '59,130,246' : '103,232,249', 0.5 - j * 0.08);
      } else {
        for (let n = 0; n < 3; n++) {
          S.parts.push({ x: x + rnd(-1.5, 1.5) * u, y: y + rnd(-1.5, 1.5) * u, vx: rnd(-0.12, 0.12) * u, vy: -rnd(0.25, 0.7) * u, life: 1, d: rnd(0.022, 0.04), s: k.px(rnd(6, 9.5), 2.6) });
        }
      }
    }
    if (!k.still) {
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.05, 0.05) * u; p.life -= p.d;
        if (p.life <= 0 || !k.off(p.x, p.y)) continue;
        const h = p.life;
        k.glow(p.x, p.y, p.s * (0.35 + h * 0.75), h > 0.7 ? '236,254,255' : h > 0.4 ? '103,232,249' : h > 0.18 ? '59,130,246' : '67,56,202', 0.5 * h);
      }
    }
    for (const [x, y] of heads) {
      k.glow(x, y, k.px(10, 3.8), '34,211,238', 0.55);
      k.glow(x, y, k.px(4.8, 1.9), '255,255,255', 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 神秘大獎: a summoning circle, question marks rising out of it
  mystery(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(8, t * 0.35, 48 * u, '168,85,247', 0.24, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '126,34,206', 0.26 + 0.08 * Math.sin(t * 2.2));
    ctx.globalCompositeOperation = 'source-over';
    const rho = R + 30 * u;
    const line = k.px(1.1, 0.6);
    // two squares turning against each other: an eight-pointed star whose
    // sides slip behind the face
    const corners = [];
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = line; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 6 * u;
    for (const [rot, col] of [[t * 0.3, 'rgba(253,224,71,.9)'], [-t * 0.3 + TAU / 8, 'rgba(233,213,255,.85)']]) {
      ctx.strokeStyle = col; ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = k.at(rot + (i * TAU) / 4, rho);
        corners.push(p);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
    // the circle round it: two rims, runes lighting up one after another
    k.ring(rho, line, 'rgba(253,224,71,.8)', '#facc15', 6 * u);
    k.ring(rho + 5.5 * u, line, 'rgba(216,180,254,.7)');
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = line; ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 4 * u;
    for (let i = 0; i < 24; i++) {
      const a = -t * 0.5 + (i * TAU) / 24;
      const lit = 0.3 + 0.7 * Math.max(0, Math.sin(t * 3 - i * 0.55));
      ctx.strokeStyle = `rgba(243,232,255,${lit.toFixed(3)})`; ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      if (i % 3 === 0) {
        ctx.moveTo(...k.at(a, rho + 1.2 * u)); ctx.lineTo(...k.at(a, rho + 4.3 * u)); ctx.stroke();
      } else if (i % 3 === 1) {
        ctx.arc(c, c, rho + 2.75 * u, a - 0.05, a + 0.05); ctx.stroke();
      } else {
        const [x, y] = k.at(a, rho + 2.75 * u);
        ctx.arc(x, y, k.px(0.9, 0.5), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    k.ring(R, 4 * u, k.conic(t * 2, ['#3b0764', '#e9d5ff', '#9333ea', '#fde68a', '#581c87', '#facc15', '#3b0764']), '#9333ea', 14 * u);
    ctx.save(); ctx.setLineDash([2 * u, 4 * u]); ctx.lineDashOffset = t * 10 * u; k.ring(R + 6.5 * u, k.px(1.2, 0.6), 'rgba(253,224,71,.7)'); ctx.restore();
    k.shine(t, 3.2, 4 * u, '243,232,255');
    k.hole();
    // a gem at each of the eight points, pulsing in turn
    ctx.globalCompositeOperation = 'lighter';
    corners.forEach(([x, y], i) => {
      const pulse = 0.55 + 0.45 * Math.sin(t * 3 + i * 0.8);
      k.glow(x, y, k.px(5.5, 2.2), i < 4 ? '253,224,71' : '216,180,254', 0.85 * pulse);
      k.glow(x, y, k.px(2, 0.9), '255,255,255', 1);
    });
    ctx.globalCompositeOperation = 'source-over';
    // the question, asked again and again
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.35 + i / 3) % 1;
      const [x, y] = k.at([-2.55, -1.57, -0.6][i], R + 9 * u);
      k.glyph('?', x, y - q * 16 * u, k.px(13, 6.5) * (0.75 + 0.5 * q), '#fde68a', Math.sin(t * 2 + i) * 0.2, Math.sin(q * Math.PI));
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(6, 28) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(7, 2.6), t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.8 + s.ph)));
    }
  },

  // 復仇者: crossed swords behind the face, cuts of light across it
  blade(k, t) {
    const { ctx, c, u, R, S } = k;
    k.rays(10, t * 0.5, 40 * u, '225,29,72', 0.2, 0.26);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '159,18,57', 0.26 + 0.07 * Math.sin(t * 2.2));
    ctx.globalCompositeOperation = 'source-over';
    // two swords crossed behind the face: points up, hilts down
    const bw = k.px(3.3, 1.3);
    const tip = R + 38 * u;
    const glint = (t * 0.5) % 1.8;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c); ctx.rotate(side * 0.62);
      ctx.shadowColor = '#e11d48'; ctx.shadowBlur = 9 * u;
      let g = ctx.createLinearGradient(-bw, 0, bw, 0);
      g.addColorStop(0, '#475569'); g.addColorStop(0.3, '#f8fafc'); g.addColorStop(0.5, '#94a3b8'); g.addColorStop(0.7, '#e2e8f0'); g.addColorStop(1, '#334155');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(-bw, -(tip - bw * 3)); ctx.lineTo(0, -tip); ctx.lineTo(bw, -(tip - bw * 3)); ctx.lineTo(bw, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // light running up the blade
      if (glint < 1) {
        const gy = -(R + glint * 40 * u);
        ctx.save(); ctx.clip();
        g = ctx.createLinearGradient(0, gy + 9 * u, 0, gy - 9 * u);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(-bw, gy - 9 * u, bw * 2, 18 * u); ctx.restore();
      }
      // the hilt, on the far side: guard, grip, pommel
      const hy = R + 4.5 * u;
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 4 * u;
      g = ctx.createLinearGradient(0, hy, 0, hy + bw * 1.1); g.addColorStop(0, '#fef3c7'); g.addColorStop(0.5, '#f59e0b'); g.addColorStop(1, '#92400e');
      ctx.fillStyle = g; ctx.fillRect(-bw * 3.2, hy, bw * 6.4, bw * 1.1);
      ctx.fillStyle = '#7f1d1d'; ctx.fillRect(-bw * 0.62, hy + bw * 1.1, bw * 1.24, bw * 3.4);
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(0, hy + bw * 5.2, bw * 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    k.ring(R, 4 * u, k.conic(t * 2.6, ['#1c1917', '#fecdd3', '#be123c', '#e7e5e4', '#44403c', '#fb7185', '#1c1917']), '#e11d48', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(255,228,230,.7)');
    k.shine(t, 3.9, 4 * u, '255,228,230');
    // three cuts, one after another: two crossing, then the finisher. Each is
    // drawn in a blink right across the canvas (behind the face), burns
    // white, and cools to a red line
    const T = 2.6;
    const cyc = Math.floor(t / T);
    const lt = k.still ? 0.56 : t - cyc * T;
    const turn = k.still ? 0.2 : cyc * 2.4;
    if (S.cyc !== cyc) { S.cyc = cyc; S.cut = 0; }
    const L = R + 48 * u;
    // each: when it starts (s), its angle, how far off centre it runs (× R)
    const CUTS = [[0, 0.4, 0.22], [0.16, -0.4, -0.2], [0.44, Math.PI / 2 + 0.15, 0.05]];
    const hits = [];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    CUTS.forEach(([t0, ang, off], i) => {
      const e = lt - t0;
      if (e < 0 || e > 1.25) return;
      const a = ang + turn;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const ox = c - dy * off * R;
      const oy = c + dx * off * R;
      const wipe = Math.min(1, e / 0.07);
      const fade = e < 0.14 ? 1 : Math.max(0, 1 - (e - 0.14) / 1.1) ** 1.6;
      const big = i === 2 ? 1.35 : 1;
      const x0 = ox - dx * L;
      const y0 = oy - dy * L;
      const x1 = x0 + dx * 2 * L * wipe;
      const y1 = y0 + dy * 2 * L * wipe;
      // afterimages peeling off to either side
      for (const sgn of [-1, 1]) {
        const d = sgn * e * 7 * u;
        k.lens(x0 - dy * d, y0 + dx * d, x1 - dy * d, y1 + dx * d, k.px(2.4, 1) * big); ctx.fillStyle = `rgba(244,63,94,${(0.22 * fade).toFixed(3)})`; ctx.fill();
      }
      ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 14 * u;
      k.lens(x0, y0, x1, y1, k.px(10, 3.4) * big * (0.3 + 0.7 * fade)); ctx.fillStyle = `rgba(225,29,72,${(0.6 * fade).toFixed(3)})`; ctx.fill();
      ctx.shadowBlur = 0;
      k.lens(x0, y0, x1, y1, k.px(5, 1.8) * big * (0.3 + 0.7 * fade)); ctx.fillStyle = `rgba(255,170,185,${(0.9 * fade).toFixed(3)})`; ctx.fill();
      k.lens(x0, y0, x1, y1, k.px(1.9, 0.8) * big); ctx.fillStyle = `rgba(255,255,255,${Math.min(1, fade * 1.6).toFixed(3)})`; ctx.fill();
      if (i === 2 && e < 0.2) k.glow(c, c, R * 1.95, '255,200,210', 0.34 * (1 - e / 0.2));
      // where it crosses the ring: a hot spot, and sparks thrown along the cut
      const half = Math.sqrt(Math.max(0, R * R - (off * R) ** 2));
      for (const sgn of [-1, 1]) hits.push([ox + dx * half * sgn, oy + dy * half * sgn, fade]);
      if (!k.still && S.cut === i) {
        S.cut = i + 1;
        for (const sgn of [-1, 1]) {
          for (let n = 0; n < 7; n++) {
            const sa = Math.atan2(dy * sgn, dx * sgn) + rnd(-0.7, 0.7);
            const v = rnd(1.2, 3.4) * u;
            S.parts.push({ x: ox + dx * half * sgn, y: oy + dy * half * sgn, vx: Math.cos(sa) * v, vy: Math.sin(sa) * v, life: 1, d: rnd(0.03, 0.06) });
          }
        }
      }
    });
    ctx.restore();
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, f] of hits) {
      k.glow(x, y, k.px(9, 3.4) * (0.4 + 0.6 * f), '255,214,220', f);
      k.star4(x, y, k.px(8, 3) * f, t * 3, '#ffffff', f);
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy = p.vy * 0.96 + 0.05 * u; p.life -= p.d;
      if (k.off(p.x, p.y)) k.spark(p, p.life > 0.6 ? '255,255,255' : '251,113,133', k.px(1.5, 0.8), 3);
    }
    // embers in the quiet between
    for (const p of k.parts(8, 0.08, () => ({ x: c + rnd(-1, 1) * R * 1.6, y: c + R * 1.7, vy: rnd(0.3, 0.8) * u, ph: rnd(TAU), life: 1 }), 'motes')) {
      p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.3 * u; p.life -= 0.008;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, k.px(2.4, 1), '251,113,133', p.life * 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 錢圈常客: a laurel wreath, a medal on its ribbon
  laurel(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(12, t * 0.2, 36 * u, '250,204,21', 0.16);
    k.base(t, { glow: '34,197,94', stops: ['#14532d', '#bbf7d0', '#16a34a', '#fef9c3', '#166534', '#86efac', '#14532d'], shine: '220,252,231', speed: 1.5 });
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(254,249,195,.7)');
    k.hole();
    // the wreath: a branch up each side from the foot, leaves in pairs, a
    // gleam running up them
    const N = 9;
    const stem = R + 9 * u;
    const gleam = (t * 0.55) % 1.7;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.strokeStyle = '#a16207'; ctx.lineWidth = k.px(1.2, 0.6); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(c, c, stem, Math.PI / 2 - side * 0.2, Math.PI / 2 - side * 2.8, side > 0); ctx.stroke(); ctx.restore();
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1);
        const a = Math.PI / 2 - side * (0.3 + q * 2.4);
        const [x, y] = k.at(a, stem);
        const len = k.px(15.5 - 5 * q, 6.2 - 1.8 * q);
        const lit = Math.max(0, 1 - Math.abs(q - gleam) * 3.5);
        const sway = Math.sin(t * 1.8 + i * 0.6) * 0.08;
        // the outer leaf of the pair, then the inner, smaller
        for (const [turn, scale] of [[Math.PI / 2 - 0.62, 1], [Math.PI / 2 + 0.5, 0.72]]) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(a - side * (turn + sway));
          const g = ctx.createLinearGradient(0, 0, len * scale, 0);
          g.addColorStop(0, '#14532d'); g.addColorStop(0.55, i % 2 ? '#22c55e' : '#16a34a'); g.addColorStop(1, '#bbf7d0');
          ctx.fillStyle = g; ctx.shadowColor = '#16a34a'; ctx.shadowBlur = 3 * u;
          k.leaf(len * scale, len * scale * 0.24, 0.45); ctx.fill(); ctx.shadowBlur = 0;
          if (lit > 0) { ctx.fillStyle = `rgba(254,240,138,${(lit * 0.8).toFixed(3)})`; ctx.fill(); }
          ctx.strokeStyle = 'rgba(254,249,195,.55)'; ctx.lineWidth = k.px(0.5, 0.35);
          ctx.beginPath(); ctx.moveTo(len * scale * 0.1, 0); ctx.lineTo(len * scale * 0.85, 0); ctx.stroke();
          ctx.restore();
        }
        // a golden berry between every other pair
        if (i % 2) {
          const [bx, by] = k.at(a + side * 0.14, stem + 1.5 * u);
          ctx.save(); ctx.fillStyle = '#fde047'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 4 * u;
          ctx.beginPath(); ctx.arc(bx, by, k.px(1.5, 0.7), 0, TAU); ctx.fill(); ctx.restore();
        }
      }
    }
    k.star4(c, c - R - 11 * u, k.px(8, 3.2), t * 0.8, '#fef9c3', 0.65 + 0.35 * Math.sin(t * 3));
    // the medal at the foot: two ribbon tails, a gold disc with a star
    const my = c + R + 9.5 * u;
    const mr = k.px(6.5, 2.9);
    ctx.save();
    for (const side of [-1, 1]) {
      ctx.fillStyle = side < 0 ? '#b91c1c' : '#dc2626';
      ctx.beginPath(); ctx.moveTo(c, my); ctx.lineTo(c + side * mr * 0.5, my); ctx.lineTo(c + side * mr * 1.25, my + mr * 2.3);
      ctx.lineTo(c + side * mr * 0.75, my + mr * 1.95); ctx.lineTo(c + side * mr * 0.3, my + mr * 2.3); ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = '#facc15'; ctx.shadowBlur = 8 * u;
    let g = ctx.createLinearGradient(c - mr, my - mr, c + mr, my + mr); g.addColorStop(0, '#fffbeb'); g.addColorStop(0.45, '#facc15'); g.addColorStop(1, '#a16207');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, my, mr, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#a16207'; ctx.lineWidth = k.px(0.7, 0.4); ctx.beginPath(); ctx.arc(c, my, mr * 0.76, 0, TAU); ctx.stroke();
    // a five-pointed star struck into it
    ctx.fillStyle = '#fffbeb'; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const sa = -Math.PI / 2 + (i * TAU) / 10;
      const sr = mr * (i % 2 ? 0.26 : 0.62);
      ctx.lineTo(c + Math.cos(sa) * sr, my + Math.sin(sa) * sr);
    }
    ctx.closePath(); ctx.fill();
    // light sliding across the disc
    const slide = ((t * 0.6) % 1.6) * 2 - 1;
    if (slide < 1.2) {
      ctx.beginPath(); ctx.arc(c, my, mr, 0, TAU); ctx.clip();
      g = ctx.createLinearGradient(c + (slide - 0.5) * mr * 2, my, c + (slide + 0.5) * mr * 2, my + mr);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(c - mr, my - mr, mr * 2, mr * 2);
    }
    ctx.restore();
    // gold dust rising
    ctx.globalCompositeOperation = 'lighter';
    for (const p of k.parts(10, 0.1, () => ({ x: c + rnd(-1, 1) * R * 1.7, y: c + R * 1.6, vy: rnd(0.25, 0.7) * u, ph: rnd(TAU), life: 1 }))) {
      p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.3 * u; p.life -= 0.007;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, k.px(2.2, 0.9), '253,224,71', p.life * (0.6 + 0.4 * Math.sin(t * 9 + p.ph)) * k.edge(p.x, p.y));
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 不死鳥: wings of flame, a tail of three plumes, and the fire surging
  firebird(k, t) {
    const { ctx, c, u, R, S } = k;
    // every few seconds it flares up: born again
    const flare = k.still ? 0.3 : Math.max(0, Math.sin(t * 1.3)) ** 8;
    const beat = Math.sin(t * 2.6);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c - 4 * u, R * (1.75 + 0.15 * flare), '249,115,22', 0.26 + 0.05 * Math.sin(t * 9) + 0.22 * flare);
    k.glow(c, c, R * 1.4, '220,38,38', 0.18);
    // the tail: three long plumes curling down, an eye at the end of each
    for (let j = -1; j <= 1; j++) {
      const [x0, y0] = k.at(Math.PI / 2 + j * 0.3, R);
      const long = (j ? 34 : 44) * u;
      let ex = x0;
      let ey = y0;
      for (let i = 0; i <= 14; i++) {
        const s = i / 14;
        ex = x0 + j * s * 21 * u + Math.sin(s * 3.2 + t * 2 + j * 1.4) * 3.4 * u * s;
        ey = y0 + s * long;
        k.glow(ex, ey, k.px(7.5 - 4.5 * s, 1.8), s < 0.3 ? '254,240,138' : s < 0.65 ? '249,115,22' : '220,38,38', 0.6 - 0.25 * s);
      }
      k.glow(ex, ey, k.px(5.5, 2.2), '253,224,71', 0.9);
      k.glow(ex, ey, k.px(2.2, 1), '255,255,255', 1);
    }
    // the wings, each side: long red feathers behind, shorter gold ones over them
    const LAYERS = [
      [7, 48, 4.6, 0.29, ['rgba(253,186,116,.9)', 'rgba(239,68,68,.7)', 'rgba(153,27,27,0)']],
      [6, 27, 3.3, 0.3, ['rgba(255,251,235,.95)', 'rgba(251,191,36,.8)', 'rgba(249,115,22,0)']],
    ];
    const feather = (n, i, long, step) => {
      const root = -0.98 + i * step * (1 + 0.1 * beat) + (n === 6 ? 0.1 : 0);
      // the second feather down is the longest: a wing raised and spread
      const size = 1 - 0.13 * Math.abs(i - 1) - (i > 1 ? 0.02 * (i - 1) : 0);
      return [root, root * 0.72 - 0.42 - 0.1 * beat, long * size * u * (1 + 0.06 * Math.sin(t * 12 + i * 2) + 0.2 * flare)];
    };
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c); ctx.scale(side, 1);
      for (const [n, long, hw, step, cols] of LAYERS) {
        for (let i = 0; i < n; i++) {
          const [root, aim, len] = feather(n, i, long, step);
          ctx.save(); ctx.rotate(root); ctx.translate(R - 1 * u, 0); ctx.rotate(aim - root);
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
          ctx.fillStyle = g; k.leaf(len, k.px(hw, hw * 0.4), 0.35); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }
    // flames coming off the feathers
    if (!k.still) {
      for (let n = 0; n < 3 + Math.round(flare * 5); n++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const [root, aim, len] = feather(7, Math.floor(rnd(7)), 48, 0.29);
        const s = rnd(0.3, 1) * len;
        S.parts.push({
          x: c + side * (Math.cos(root) * R + Math.cos(aim) * s), y: c + Math.sin(root) * R + Math.sin(aim) * s,
          vx: side * rnd(0, 0.35) * u, vy: -rnd(0.5, 1.4) * u, life: 1, d: rnd(0.035, 0.06), s: k.px(rnd(5, 9), 2.2),
        });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.1, 0.1) * u; p.life -= p.d;
        const h = p.life;
        if (h > 0) k.glow(p.x, p.y, p.s * (0.4 + h * 0.7), h > 0.75 ? '255,246,200' : h > 0.45 ? '255,160,36' : h > 0.2 ? '255,64,8' : '140,20,6', 0.34 * h);
      }
    }
    k.ring(R, 4 * u, k.conic(t * 2, ['#7c2d12', '#fef08a', '#f97316', '#fff7ed', '#b91c1c', '#fbbf24', '#7c2d12']), '#fb923c', (16 + 10 * flare) * u);
    k.ring(R - 1.4 * u, k.px(1, 0.5), 'rgba(255,250,210,.9)', '#ffd54f', 6 * u);
    ctx.globalCompositeOperation = 'source-over';
    k.shine(t, 3, 4 * u, '255,237,213');
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    // the crest: three small flames over the head
    for (let j = -1; j <= 1; j++) {
      const a = -Math.PI / 2 + j * 0.24;
      const len = k.px(j ? 11 : 16, j ? 4 : 5.6) * (1 + 0.1 * Math.sin(t * 10 + j) + 0.25 * flare);
      ctx.save(); ctx.translate(...k.at(a, R + 1 * u)); ctx.rotate(a + j * 0.25);
      const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,251,235,.95)'); g.addColorStop(0.5, 'rgba(251,146,60,.85)'); g.addColorStop(1, 'rgba(220,38,38,0)');
      ctx.fillStyle = g; k.leaf(len, len * 0.2, 0.35); ctx.fill(); ctx.restore();
    }
    // embers going up, a rush of them when it flares
    for (const p of k.parts(22, 0.3 + flare, () => ({ x: c + rnd(-1, 1) * R * 1.5, y: c + R * rnd(0.6, 1.4), vx: rnd(-0.2, 0.2) * u, vy: -rnd(0.9, 2.2) * u, life: 1 }), 'embers')) {
      p.x += p.vx + Math.sin(t * 3 + p.y) * 0.2 * u; p.y += p.vy; p.life -= 0.016;
      if (k.off(p.x, p.y)) k.spark(p, p.life > 0.6 ? '255,240,170' : '253,186,116', k.px(1.4, 0.8), 2.5);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 重買王: charging up cell by cell, then letting it all go, again and again
  reload(k, t) {
    const { ctx, c, u, R, S } = k;
    const N = 12;
    const lt = k.still ? 1.65 : t % 3.2; // 2.2 s to fill, then the discharge
    const charge = Math.min(1, lt / 2.2);
    const e = lt - 2.2; // seconds since it went off (< 0 while charging)
    const boom = e >= 0 ? Math.max(0, 1 - e / 0.7) : 0;
    S.tick++;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * (1.7 + 0.25 * boom), '6,182,212', 0.16 + 0.14 * charge * (e < 0 ? 1 : 0) + 0.42 * boom);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = k.px(1.2, 0.6);
    if (e < 0) {
      // power drawn in: streaks falling onto the ring, faster as it fills
      for (let i = 0; i < 16; i++) {
        const q = (t * (1 + (i % 4) * 0.3) * (0.7 + 0.8 * charge) + i * 0.37) % 1;
        const a = i * 2.399;
        const r = R + (46 - 36 * q * q) * u;
        ctx.strokeStyle = `rgba(165,243,252,${(q * (0.25 + 0.6 * charge)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(...k.at(a, r)); ctx.lineTo(...k.at(a, r + (3 + 9 * q) * u)); ctx.stroke();
      }
    } else if (e < 0.5) {
      // let go: a shock wave, and everything flying out
      const q = e / 0.5;
      for (let i = 0; i < 24; i++) {
        const a = (i * TAU) / 24 + 0.1;
        const r = R + (8 + 40 * q) * u;
        ctx.strokeStyle = `rgba(236,254,255,${(1 - q).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(...k.at(a, r)); ctx.lineTo(...k.at(a, r + (i % 2 ? 12 : 7) * (1 - q) * u)); ctx.stroke();
      }
      k.ring(R + (8 + 44 * q) * u, k.px(0.5 + 3.5 * (1 - q), 0.6), `rgba(236,254,255,${(1 - q).toFixed(3)})`, '#22d3ee', 10 * u);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 2.4, ['#083344', '#a5f3fc', '#0891b2', '#ecfeff', '#155e75', '#67e8f9', '#083344']), '#22d3ee', (12 + 12 * boom) * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(236,254,255,.75)');
    // an instrument ring further out, two lights chasing round it
    ctx.save(); ctx.setLineDash([8 * u, 3 * u, 1.5 * u, 3 * u]); ctx.lineDashOffset = t * 9 * u; k.ring(R + 15 * u, k.px(0.9, 0.5), 'rgba(103,232,249,.5)'); ctx.restore();
    k.shine(t, 3.7, 4 * u, '207,250,254');
    k.hole();
    // twelve cells filling clockwise from the top
    const filled = e < 0 ? charge * N : 0;
    const blaze = e >= 0 ? Math.max(0, 1 - e / 0.45) : 0;
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = k.px(4, 1.5);
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + (i * TAU) / N + 0.05;
      const span = TAU / N - 0.1;
      const lvl = Math.max(0, Math.min(1, filled - i));
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(103,232,249,.2)';
      ctx.beginPath(); ctx.arc(c, c, R + 8 * u, a0, a0 + span); ctx.stroke();
      if (lvl > 0 || blaze > 0) {
        ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8 * u;
        ctx.strokeStyle = blaze > 0 ? `rgba(236,254,255,${blaze.toFixed(3)})` : (i >= 9 ? '#ecfeff' : '#67e8f9');
        ctx.beginPath(); ctx.arc(c, c, R + 8 * u, a0, a0 + span * (blaze > 0 ? 1 : lvl)); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    if (e < 0) {
      // the leading edge: a spark, and current arcing off the cells
      const fa = -Math.PI / 2 + (filled / N) * TAU;
      const [fx, fy] = k.at(fa, R + 8 * u);
      if (k.still ? !S.bolts.length : S.tick % 3 === 0) {
        S.bolts = [];
        for (let b = 0; b < 1 + Math.round(charge * 2); b++) {
          const pts = [];
          const reach = rnd(9, 20) * u;
          const ba = fa - b * rnd(0.5, 1.6);
          for (let i = 0; i <= 5; i++) pts.push([R + 8 * u + (reach * i) / 5, (i ? rnd(-0.07, 0.07) : 0) + ba - fa]); // [how far out, angle from the leading edge]
          S.bolts.push(pts);
        }
      }
      ctx.save(); ctx.lineJoin = 'round';
      for (const pts of S.bolts) {
        for (const [w, col, blur] of [[k.px(2.2, 1), 'rgba(103,232,249,.85)', 10 * u], [k.px(0.9, 0.5), '#ffffff', 3 * u]]) {
          ctx.lineWidth = w; ctx.strokeStyle = col; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = blur;
          ctx.beginPath(); pts.forEach(([r, da], i) => { const p = k.at(fa + da, r); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        }
      }
      ctx.restore();
      k.glow(fx, fy, k.px(8, 3), '165,243,252', 0.8);
      k.star4(fx, fy, k.px(8, 3), t * 4, '#ffffff', 0.95);
    }
    const lap = t * (1.4 + 2.2 * charge * (e < 0 ? 1 : 0));
    for (let i = 0; i < 2; i++) k.comet(lap + i * Math.PI, R + 15 * u, { n: 12, step: 0.07, size: 4.5, rgb: '103,232,249', alpha: 0.8 });
    ctx.globalCompositeOperation = 'source-over';
  },

  // 亞軍: silver wings, feather by feather
  silverwing(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(14, -t * 0.25, 38 * u, '226,232,240', 0.2);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.75, '148,163,184', 0.22 + 0.05 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R + 6.5 * u, k.px(1.2, 0.6), 'rgba(241,245,249,.8)', '#e2e8f0', 6 * u);
    k.ring(R, 4 * u, k.conic(t * 1.5, ['#334155', '#ffffff', '#94a3b8', '#f8fafc', '#475569', '#e2e8f0', '#334155']), '#e2e8f0', 13 * u);
    k.shine(t, 2.4, 4 * u, '241,245,249');
    k.hole();
    // a wing each side: long flight feathers, a row of shorter ones over
    // them, small ones at the shoulder. A sheen runs out along them.
    const flap = Math.sin(t * 2.2);
    const sheen = (t * 0.7) % 2;
    const ROWS = [
      [6, -1.22, 0.25, 52, 4.4, 5, ['#f8fafc', '#cbd5e1', 'rgba(148,163,184,.55)']],
      [5, -0.55, 0.27, 33, 3, 4.4, ['#ffffff', '#e2e8f0', 'rgba(203,213,225,.7)']],
      [5, -1.0, 0.36, 16, 0.8, 4, ['#ffffff', '#f8fafc', '#e2e8f0']],
    ];
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c); ctx.scale(side, 1);
      ctx.translate(Math.cos(-0.2) * R, Math.sin(-0.2) * R); ctx.rotate(flap * 0.1);
      ROWS.forEach(([n, first, step, long, less, hw, cols], row) => {
        for (let i = n - 1; i >= 0; i--) {
          const len = k.px(long - i * less, (long - i * less) * 0.36);
          ctx.save(); ctx.rotate(first + i * step * (1 - 0.12 * flap));
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, cols[0]); g.addColorStop(0.6, cols[1]); g.addColorStop(1, cols[2]);
          ctx.fillStyle = g; ctx.shadowColor = '#cbd5e1'; ctx.shadowBlur = 4 * u;
          k.leaf(len, k.px(hw, hw * 0.4), 0.55); ctx.fill(); ctx.shadowBlur = 0;
          const lit = Math.max(0, 1 - Math.abs(sheen - (i / n) * 0.7 - row * 0.15) * 3);
          if (lit > 0) { ctx.fillStyle = `rgba(255,255,255,${(lit * 0.7).toFixed(3)})`; ctx.fill(); }
          // the shaft
          ctx.strokeStyle = 'rgba(100,116,139,.55)'; ctx.lineWidth = k.px(0.5, 0.35);
          ctx.beginPath(); ctx.moveTo(len * 0.08, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
          ctx.restore();
        }
      });
      ctx.restore();
    }
    // second place: a silver medal at the foot
    const my = c + R + 10 * u;
    const mr = k.px(6.5, 3.1);
    ctx.save(); ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 7 * u;
    let g = ctx.createLinearGradient(c - mr, my - mr, c + mr, my + mr); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#cbd5e1'); g.addColorStop(1, '#475569');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, my, mr, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    g = ctx.createRadialGradient(c - mr * 0.3, my - mr * 0.3, 0, c, my, mr * 0.8); g.addColorStop(0, '#475569'); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, my, mr * 0.78, 0, TAU); ctx.fill(); ctx.restore();
    k.glyph('2', c, my, mr * 1.35, '#f8fafc', 0, 1);
    // feathers shed now and then, drifting down
    for (const p of k.parts(5, 0.03, () => ({ x: c + (Math.random() < 0.5 ? -1 : 1) * rnd(0.9, 1.9) * R, y: c - R * rnd(0.2, 1.2), vy: rnd(0.25, 0.5) * u, ph: rnd(TAU), life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 1.4 + p.ph) * 0.7 * u; p.life -= 0.005;
      if (!k.off(p.x, p.y)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t * 1.4 + p.ph) * 0.9 + 1.2); ctx.globalAlpha = Math.min(1, p.life * 4, (1 - p.life) * 8);
      ctx.fillStyle = '#f1f5f9'; ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 4 * u; k.leaf(k.px(9, 3.6), k.px(2.2, 0.9), 0.5); ctx.fill(); ctx.restore();
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(8, 34) * u, ph: rnd(TAU) }), 'glints')) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(7, 2.6), t + s.ph, '#ffffff', Math.max(0, Math.sin(t * 2.4 + s.ph)));
    }
  },

  // 泡沫: soap bubbles, froth at the foot
  foam(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '56,189,248', 0.18 + 0.05 * Math.sin(t * 1.6));
    k.glow(c + 10 * u, c - 12 * u, R * 1.3, '232,121,249', 0.12);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.3, ['#0c4a6e', '#bae6fd', '#38bdf8', '#fbcfe8', '#0369a1', '#a5f3fc', '#0c4a6e']), '#38bdf8', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(240,249,255,.75)');
    k.shine(t, 2.4, 4 * u, '224,242,254');
    k.hole();
    const conic = typeof ctx.createConicGradient === 'function';
    // one bubble: a clear film tinted towards the rim, colours sliding round
    // the rim, a window of light on it. `squash` wobbles it.
    const bubble = (x, y, r, a, turn, squash = 1) => {
      if (a <= 0 || r <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(squash, 1 / squash); ctx.globalAlpha = Math.min(1, a);
      const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
      g.addColorStop(0, 'rgba(186,230,253,.03)'); g.addColorStop(0.8, 'rgba(186,230,253,.13)'); g.addColorStop(1, 'rgba(240,171,252,.4)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      let rim = '#bae6fd';
      if (conic) {
        rim = ctx.createConicGradient(turn, 0, 0);
        ['#a5f3fc', '#f0abfc', '#fde68a', '#a7f3d0', '#a5f3fc'].forEach((col, i) => rim.addColorStop(i / 4, col));
      }
      ctx.lineWidth = Math.max(r * 0.14, 0.6); ctx.strokeStyle = rim; ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 4 * u; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(r * 0.16, 0.6); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(r * 0.42, r * 0.42, Math.max(r * 0.1, 0.4), 0, TAU); ctx.fill();
      ctx.restore();
    };
    // froth round the lower half
    for (const b of k.fixed(28, () => {
      const big = Math.random() < 0.3;
      return { a: rnd(0.2, 2.94), r: big ? rnd(7, 13) : rnd(3, 11), z: big ? rnd(4.5, 7) : rnd(1.6, 3.4), ph: rnd(TAU) };
    }, 'froth')) {
      const [x, y] = k.at(b.a, R + b.r * u);
      bubble(x, y + Math.sin(t * 2 + b.ph) * 0.6 * u, k.px(b.z, b.z * 0.42), 0.9, t + b.ph);
    }
    // big ones hanging in the air, wobbling
    for (const b of k.fixed(5, (i) => ({ a: -2.9 + i * 0.68 + rnd(-0.1, 0.1), r: rnd(17, 26), z: rnd(7.5, 12), ph: rnd(TAU) }), 'big')) {
      const a = b.a + Math.sin(t * 0.6 + b.ph) * 0.14;
      const [x, y] = k.at(a, R + b.r * u + Math.sin(t * 1.1 + b.ph) * 2.5 * u);
      bubble(x, y, k.px(b.z, 2.6), 0.95, t * 0.8 + b.ph, 1 + 0.07 * Math.sin(t * 3 + b.ph));
    }
    // small ones rising from the froth; each pops at the end
    for (const p of k.parts(12, 0.14, () => ({ x: c + rnd(-1, 1) * R * 1.6, y: c + R * 1.5, vy: rnd(0.45, 1) * u, z: rnd(2.6, 5), ph: rnd(TAU), life: 1, d: rnd(0.006, 0.011) }))) {
      p.life -= p.d;
      if (!k.off(p.x, p.y)) { p.y -= p.vy; continue; }
      const r = k.px(p.z, 1.3);
      if (p.life > 0.1) {
        p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.4 * u;
        bubble(p.x, p.y, r, Math.min(1, (1 - p.life) * 6), t + p.ph, 1 + 0.06 * Math.sin(t * 4 + p.ph));
      } else {
        // pop: a ring of droplets flying off
        const q = 1 - p.life / 0.1;
        ctx.save(); ctx.strokeStyle = `rgba(224,242,254,${(1 - q).toFixed(3)})`; ctx.lineWidth = k.px(1, 0.5); ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a = (i * TAU) / 7 + p.ph;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r * (1 + q * 0.8), p.y + Math.sin(a) * r * (1 + q * 0.8));
          ctx.lineTo(p.x + Math.cos(a) * r * (1.3 + q * 1.4), p.y + Math.sin(a) * r * (1.3 + q * 1.4)); ctx.stroke();
        }
        ctx.restore();
      }
    }
  },

  // 開路先鋒: a whirlwind, leaves torn along in it
  gale(k, t) {
    const { ctx, c, u, R } = k;
    // it blows in gusts
    const gust = k.still ? 0.4 : Math.max(0, Math.sin(t * 0.9)) ** 4;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '132,204,22', 0.18 + 0.05 * Math.sin(t * 2.4) + 0.1 * gust);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 3.4, ['#1a2e05', '#ecfccb', '#65a30d', '#f7fee7', '#3f6212', '#bef264', '#1a2e05']), '#a3e635', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(247,254,231,.75)');
    k.shine(t, 4.9, 4 * u, '236,252,203');
    k.hole();
    // a ribbon of wind: a swoosh curving round, its head on the inside and
    // sharp, swelling behind it and trailing off outwards to a point
    const ribbon = (head, span, r0, drift, w) => {
      const M = 18;
      ctx.beginPath();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i <= M; i++) {
          const s = pass ? 1 - i / M : i / M;
          const [x, y] = k.at(head - s * span, r0 + s * drift + (pass ? -1 : 1) * w * Math.sin(Math.PI * s ** 0.55));
          if (pass || i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
      }
      ctx.closePath(); ctx.fill();
    };
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 6 * u;
    // each: speed, where it starts, how far out, how long, drift outwards, width
    for (const [speed, at, far, span, drift, w] of [[3.2, 0, 7, 2.2, 6, 2.6], [2.6, 2.1, 13, 1.8, 8, 2.2], [3.8, 4, 19, 2.6, 7, 1.9], [2.9, 1, 26, 1.5, 9, 1.6], [3.5, 3.1, 10, 1.3, 12, 1.4], [2.3, 5.2, 31, 2, 6, 1.3]]) {
      const head = t * speed + at;
      const wide = k.px(w, w * 0.42) * (1 + 0.6 * gust);
      ctx.fillStyle = 'rgba(190,242,100,.3)'; ribbon(head, span, R + far * u, drift * u, wide * 1.7);
      ctx.fillStyle = 'rgba(247,254,231,.85)'; ribbon(head, span * 0.85, R + far * u, drift * u * 0.85, wide * 0.6);
    }
    ctx.restore();
    // leaves flung outwards as they go round, tumbling
    for (let i = 0; i < 6; i++) {
      const q = (t * 0.45 + i / 6) % 1;
      const a = t * 2.4 + i * 1.9 + q * 2;
      const len = k.px(8.5, 3.4);
      ctx.save(); ctx.translate(...k.at(a, R + (8 + 36 * q) * u)); ctx.rotate(a * 2 + t * 5); ctx.scale(1, Math.cos(t * 6 + i * 2) || 0.01);
      ctx.globalAlpha = Math.sin(q * Math.PI) ** 0.6;
      const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#3f6212'); g.addColorStop(0.6, '#84cc16'); g.addColorStop(1, '#ecfccb');
      ctx.fillStyle = g; ctx.shadowColor = '#84cc16'; ctx.shadowBlur = 4 * u; k.leaf(len, len * 0.22, 0.4); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(247,254,231,.6)'; ctx.lineWidth = k.px(0.5, 0.35); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
      ctx.restore();
    }
    // grit streaking past
    for (const p of k.parts(14, 0.4, () => ({ a: rnd(TAU), r: R + rnd(5, 40) * u, va: rnd(0.07, 0.13), life: 1 }), 'grit')) {
      p.a += p.va * (1 + gust); p.r += 0.25 * u; p.life -= 0.035;
      ctx.save(); ctx.strokeStyle = `rgba(236,252,203,${(0.7 * Math.sin(p.life * Math.PI)).toFixed(3)})`; ctx.lineWidth = k.px(0.9, 0.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(c, c, p.r, p.a - 0.16, p.a); ctx.stroke(); ctx.restore();
    }
  },

  // 大牌對決: fire on one side, ice on the other, lightning where they meet
  clash(k, t) {
    const { ctx, c, u, R, S } = k;
    S.tick++;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c - R * 0.8, c, R * 1.5, '239,68,68', 0.24 + 0.06 * Math.sin(t * 11));
    k.glow(c + R * 0.8, c, R * 1.5, '56,189,248', 0.24 + 0.06 * Math.sin(t * 2.2));
    // the left half burns
    if (k.still) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i - 3) * 0.36;
        const [x, y] = k.at(a, R + 3 * u);
        k.glow(x, y - (i % 2 ? 4 : 9) * u, Math.max((i % 2 ? 10 : 13) * u, 3.4), i % 2 ? '255,150,30' : '255,64,8', 0.36);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const a = rnd(Math.PI * 0.56, Math.PI * 1.44);
        S.parts.push({ x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, vx: Math.cos(a) * 0.5 * u + rnd(-0.3, 0.3) * u, vy: -rnd(0.7, 1.8) * u, life: 1, d: rnd(0.025, 0.05), s: Math.max(rnd(7, 14) * u, 2.4) });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.12, 0.12) * u; p.life -= p.d;
        const h = p.life;
        // the fire stops at the middle
        const mid = Math.max(0, Math.min(1, (c - p.x) / (5 * u) + 0.4));
        if (h > 0) k.glow(p.x, p.y, p.s * (0.4 + h * 0.7), h > 0.8 ? '255,246,200' : h > 0.5 ? '255,160,36' : h > 0.22 ? '255,64,8' : '140,20,6', 0.36 * h * mid);
      }
    }
    // the right half freezes: crystals growing out of the ring
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + 0.22 + (i * (Math.PI - 0.44)) / 8;
      const len = (i % 2 ? 12 : 23) * u + Math.sin(t * 2 + i) * 3 * u;
      const hw = k.px(i % 2 ? 2.6 : 3.8, 1);
      const [bx, by] = k.at(a, R + 1 * u);
      const [tx, ty] = k.at(a, R + len);
      const g = ctx.createLinearGradient(bx, by, tx, ty); g.addColorStop(0, 'rgba(240,249,255,.95)'); g.addColorStop(0.6, 'rgba(125,211,252,.75)'); g.addColorStop(1, 'rgba(56,189,248,.05)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * hw, by + Math.cos(a) * hw); ctx.lineTo(tx, ty); ctx.lineTo(bx + Math.sin(a) * hw, by - Math.cos(a) * hw); ctx.closePath(); ctx.fill();
      if (!(i % 2)) k.star4(tx, ty, k.px(5, 2), t + i, '#ffffff', Math.max(0, Math.sin(t * 3 + i * 1.7)));
    }
    ctx.globalCompositeOperation = 'source-over';
    // the ring: red-hot on the left, frozen on the right
    ctx.save(); ctx.lineWidth = 4.2 * u; ctx.shadowBlur = 14 * u;
    ctx.strokeStyle = k.conic(t * 1.5, ['#7f1d1d', '#fecaca', '#ef4444', '#fff7ed', '#7f1d1d']); ctx.shadowColor = '#ef4444';
    ctx.beginPath(); ctx.arc(c, c, R, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = k.conic(-t * 1.5, ['#0c4a6e', '#e0f2fe', '#38bdf8', '#ffffff', '#0c4a6e']); ctx.shadowColor = '#38bdf8';
    ctx.beginPath(); ctx.arc(c, c, R, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.restore();
    k.shine(t, 2.8, 4.2 * u, '255,255,255');
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    // where the two meet, top and bottom: lightning cracking outwards, steam
    if (k.still ? !S.bolts.length : S.tick % 3 === 0) {
      S.bolts = [-1, 1].map((dir) => {
        const pts = [];
        const reach = rnd(18, 30) * u;
        for (let i = 0; i <= 6; i++) pts.push([c + (i ? rnd(-3.5, 3.5) * u : 0), c + dir * (R + (reach * i) / 6)]);
        return pts;
      });
    }
    ctx.save(); ctx.lineJoin = 'round';
    for (const pts of S.bolts) {
      for (const [w, col, blur] of [[k.px(2.6, 1.1), 'rgba(196,181,253,.9)', 12 * u], [k.px(1, 0.5), '#ffffff', 4 * u]]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = blur;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    }
    ctx.restore();
    for (const dir of [-1, 1]) {
      const y = c + dir * R;
      const pulse = 0.6 + 0.4 * Math.sin(t * 6 + dir);
      k.glow(c, y, k.px(11, 4) * pulse, '255,255,255', 0.6);
      k.star4(c, y, k.px(15, 5.5) * pulse, t * 2, '#ffffff', 0.95);
      for (let n = 0; n < 3; n++) {
        const q = (t * 0.7 + n / 3) % 1;
        k.glow(c + Math.sin(n * 2 + t) * 3 * u, y - q * 15 * u, k.px(4 + 7 * q, 1.6), '226,232,240', 0.22 * (1 - q));
      }
    }
    // embers on the left going up, snow on the right coming down
    for (const p of k.parts(8, 0.14, () => ({ x: c - rnd(0.5, 1.7) * R, y: c + R * 1.5, vx: 0, vy: -rnd(0.8, 1.9) * u, ph: rnd(TAU), life: 1 }), 'embers')) {
      p.vx = Math.sin(t * 3 + p.ph) * 0.3 * u; p.x += p.vx; p.y += p.vy; p.life -= 0.014;
      if (k.off(p.x, p.y)) k.spark(p, '253,186,116', k.px(1.4, 0.8), 2.5);
    }
    for (const p of k.parts(10, 0.14, () => ({ x: c + rnd(0.3, 1.8) * R, y: c - R * 1.9, vy: rnd(0.35, 0.8) * u, ph: rnd(TAU), z: rnd(1, 2.2), life: 1 }), 'snow')) {
      p.y += p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.35 * u; p.life -= 0.006;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, k.px(p.z * 1.6, 1), '240,249,255', Math.min(1, p.life * 4) * k.edge(p.x, p.y));
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 悲劇英雄: briars braided round the ring, roses on them
  thorn(k, t) {
    const { ctx, c, u, R } = k;
    // a heartbeat: two quick beats, then rest
    const hb = (t * 0.85) % 1;
    const beat = hb < 0.16 ? Math.sin((hb / 0.16) * Math.PI) : hb > 0.24 && hb < 0.42 ? 0.7 * Math.sin(((hb - 0.24) / 0.18) * Math.PI) : 0;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * (1.75 + 0.18 * beat), '190,18,60', 0.22 + 0.18 * beat);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.1, ['#1c1917', '#fda4af', '#881337', '#d6d3d1', '#292524', '#be123c', '#1c1917']), '#be123c', (14 + 8 * beat) * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(254,205,211,.65)');
    k.shine(t, 2.1, 4 * u, '254,205,211');
    k.hole();
    // two briars weaving over and under each other, creeping slowly round
    const creep = t * 0.12;
    const vine = (phase, a) => R + (8 + 3.4 * Math.sin(a * 5 + phase)) * u;
    const strand = (phase) => {
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.06; a += 0.05) {
        const [x, y] = k.at(a + creep, vine(phase, a));
        if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [phase, dark, lite] of [[0, '#292018', '#a8937f'], [Math.PI, '#14261a', '#5fa877']]) {
      ctx.strokeStyle = dark; ctx.lineWidth = k.px(3.8, 1.6); ctx.shadowColor = '#000000'; ctx.shadowBlur = 3 * u; strand(phase);
      ctx.strokeStyle = lite; ctx.lineWidth = k.px(1.2, 0.6); ctx.shadowBlur = 0; strand(phase);
    }
    ctx.restore();
    // thorns, leaning one way and the other, pale at the point
    for (let i = 0; i < 22; i++) {
      const a = (i * TAU) / 22 + 0.07;
      const [bx, by] = k.at(a + creep, vine(i % 2 ? Math.PI : 0, a));
      const out = a + creep + (i % 2 ? 0.5 : -0.5);
      const len = k.px(i % 3 ? 9 : 14, i % 3 ? 3.4 : 5.2);
      const hw = k.px(2.4, 1);
      const tx = bx + Math.cos(out) * len;
      const ty = by + Math.sin(out) * len;
      const g = ctx.createLinearGradient(bx, by, tx, ty); g.addColorStop(0, '#44403c'); g.addColorStop(0.6, '#a8a29e'); g.addColorStop(1, '#fecdd3');
      ctx.save(); ctx.fillStyle = g; ctx.shadowColor = '#e11d48'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.moveTo(bx - Math.sin(out) * hw, by + Math.cos(out) * hw); ctx.lineTo(tx, ty); ctx.lineTo(bx + Math.sin(out) * hw, by - Math.cos(out) * hw); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // a rose seen from above: three rounds of petals, darker at their edges,
    // and a small spiral at the heart
    const rose = (x, y, s, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.shadowColor = '#9f1239'; ctx.shadowBlur = 7 * u;
      for (const [n, far, pr, col] of [[5, 0.6, 0.52, '#9f1239'], [5, 0.36, 0.42, '#e11d48'], [3, 0.15, 0.3, '#fb7185']]) {
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n + far * 4;
          const px = Math.cos(a) * s * far;
          const py = Math.sin(a) * s * far;
          const g = ctx.createRadialGradient(px, py, 0, px, py, s * pr);
          g.addColorStop(0, col); g.addColorStop(0.72, col); g.addColorStop(1, '#4c0519');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s * pr, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = '#4c0519'; ctx.lineWidth = Math.max(s * 0.07, 0.5); ctx.lineCap = 'round'; ctx.beginPath();
      for (let a = 0; a < 7; a += 0.3) ctx.lineTo(Math.cos(a) * s * 0.035 * a, Math.sin(a) * s * 0.035 * a);
      ctx.stroke(); ctx.restore();
    };
    const ROSES = [[-0.75, 11, 4.8], [2.45, 8.5, 3.9], [1.15, 6.5, 3.2]];
    for (const [a, size, min] of ROSES) {
      const s = k.px(size, min) * (1 + 0.07 * beat);
      const [x, y] = k.at(a, R + 9.5 * u);
      // two leaves under it
      for (const turn of [-1.9, 1.9]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + turn);
        const g = ctx.createLinearGradient(0, 0, s * 1.5, 0); g.addColorStop(0, '#14532d'); g.addColorStop(1, '#4ade80');
        ctx.fillStyle = g; k.leaf(s * 1.5, s * 0.36, 0.45); ctx.fill(); ctx.restore();
      }
      rose(x, y, s, a + Math.sin(t * 0.8 + a) * 0.15);
    }
    // petals letting go of the biggest one
    const [rx, ry] = k.at(ROSES[0][0], R + 9.5 * u);
    for (const p of k.parts(7, 0.05, () => ({ x: rx + rnd(-3, 3) * u, y: ry, vy: rnd(0.35, 0.8) * u, ph: rnd(TAU), life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.5 * u; p.life -= 0.006;
      if (p.y > c + R * 2.1) p.life = 0;
      if (!k.off(p.x, p.y)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 2 + p.ph); ctx.scale(1, Math.cos(t * 3 + p.ph) || 0.01); ctx.globalAlpha = Math.min(1, p.life * 4) * k.edge(p.x, p.y);
      ctx.fillStyle = '#e11d48'; ctx.shadowColor = '#9f1239'; ctx.shadowBlur = 3 * u; k.leaf(k.px(5, 2), k.px(1.7, 0.7), 0.6); ctx.fill(); ctx.restore();
    }
  },

  // 四條: the four suits in formation
  quad(k, t) {
    const { ctx, c, u, R } = k;
    // every three seconds the four draw in, lock, and flash
    const cyc = k.still ? 0.5 : (t / 3) % 1;
    const pull = cyc > 0.8 ? Math.sin(((cyc - 0.8) / 0.2) * Math.PI * 0.5) : cyc < 0.1 ? 1 - cyc / 0.1 : 0;
    const flash = cyc < 0.2 ? 1 - cyc / 0.2 : 0;
    const rot = t * 0.5;
    const orbit = R + (17 - 4 * pull) * u;
    k.rays(4, rot, 48 * u, '250,204,21', 0.28 + 0.2 * flash, 0.22);
    k.rays(4, rot + TAU / 8, 32 * u, '248,250,252', 0.2, 0.18);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '234,179,8', 0.2 + 0.06 * Math.sin(t * 2.4) + 0.25 * flash);
    if (flash > 0) k.ring(R + (8 + 38 * (1 - flash)) * u, k.px(0.5 + 3 * flash, 0.6), `rgba(254,249,195,${flash.toFixed(3)})`, '#facc15', 10 * u);
    ctx.globalCompositeOperation = 'source-over';
    // the formation: a square of light joining the four, its sides slipping
    // behind the face, and a fainter one turned against it
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = k.px(1.1, 0.6); ctx.shadowColor = '#facc15'; ctx.shadowBlur = 6 * u;
    for (const [turn, far, col] of [[rot, orbit, `rgba(253,224,71,${(0.55 + 0.45 * flash).toFixed(3)})`], [-rot * 1.5 + TAU / 8, R + 25 * u, 'rgba(244,244,245,.35)']]) {
      ctx.strokeStyle = col; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const [x, y] = k.at(turn + (i * TAU) / 4, far); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
    k.ring(R, 4 * u, k.conic(t * 2, ['#18181b', '#fef9c3', '#eab308', '#f4f4f5', '#3f3f46', '#fde047', '#18181b']), '#eab308', 14 * u);
    ctx.save(); ctx.setLineDash([6 * u, 4 * u]); ctx.lineDashOffset = -t * 12 * u; k.ring(R + 7 * u, k.px(1.5, 0.6), '#fde047', '#eab308', 5 * u); ctx.restore();
    k.shine(t, 3.2, 4 * u, '254,249,195');
    k.hole();
    // the four suits, each on a gold-rimmed medallion, light trailing behind
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * TAU) / 4;
      const [x, y] = k.at(a, orbit);
      const s = k.px(8.5, 4.3) * (1 + 0.14 * flash);
      const red = i % 2 === 1;
      ctx.globalCompositeOperation = 'lighter';
      k.comet(a, orbit, { n: 10, step: 0.075, size: 9, rgb: red ? '248,113,113' : '253,224,71', head: red ? '248,113,113' : '253,224,71', alpha: 0.4 });
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.shadowColor = '#eab308'; ctx.shadowBlur = (7 + 9 * flash) * u;
      let g = ctx.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, '#fffbeb'); g.addColorStop(0.45, '#facc15'); g.addColorStop(1, '#854d0e');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, 0, x, y, s * 0.82); g.addColorStop(0, '#3f3f46'); g.addColorStop(1, '#09090b');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, TAU); ctx.fill(); ctx.restore();
      k.suit(i, x, y, s * 0.52, red ? '#f87171' : '#f4f4f5');
      k.star4(x - s * 0.62, y - s * 0.62, s * 0.55, t * 2 + i, '#ffffff', Math.max(0, Math.sin(t * 3 + i * 1.6)));
    }
  },

  // 同花順: a spiral stair in the colours of the rainbow, a light climbing it
  rainbow(k, t) {
    const { ctx, c, u, R } = k;
    const hue = (t * 40) % 360;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '129,140,248', 0.2 + 0.06 * Math.sin(t * 2.4));
    // a soft halo in all the colours, turning slowly
    ['239,68,68', '245,158,11', '34,197,94', '6,182,212', '99,102,241', '217,70,239'].forEach((rgb, i) => {
      const [x, y] = k.at(t * 0.4 + (i * TAU) / 6, R + 15 * u);
      k.glow(x, y, k.px(30, 10), rgb, 0.2);
    });
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 2.4, ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#d946ef', '#ef4444']), '#a5b4fc', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(255,255,255,.75)');
    k.shine(t, 3, 4 * u);
    k.hole();
    // twelve steps winding once round and outwards, each a colour on
    const N = 12;
    const turn = t * 0.25;
    const climb = k.still ? 7.45 : (t * 3.2) % (N + 2.5); // where the light is, in steps
    const tread = (i) => R + (6 + i * 1.7) * u;
    for (let i = 0; i < N; i++) {
      const a0 = turn + (i * TAU) / N + 0.04;
      const lit = Math.max(0, 1 - Math.abs(climb - i - 0.5) / 1.1);
      const warm = climb > i ? Math.max(0, 1 - (climb - i) / 7) : 0; // the ones already climbed stay lit a while
      const col = `hsl(${(i * 30 + hue) % 360},95%,${Math.round(62 + 22 * lit)}%)`;
      ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = k.px(3.3, 1.3); ctx.globalAlpha = 0.38 + 0.62 * Math.max(lit, warm);
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = (4 + 9 * lit) * u;
      ctx.beginPath(); ctx.arc(c, c, tread(i), a0, a0 + TAU / N - 0.08); ctx.stroke(); ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    const spot = (at) => k.at(turn + ((at + 0.5) * TAU) / N, tread(at) + (3.6 + 4.5 * Math.sin((at % 1) * Math.PI)) * u);
    if (climb < N) {
      // the light hopping from step to step, a tail behind it
      for (let j = 7; j >= 0; j--) {
        const at = climb - j * 0.14;
        if (at < 0) continue;
        const [x, y] = spot(at);
        k.glow(x, y, k.px(6.5 - j * 0.6, 2.4 - j * 0.2), j ? `${[255, 240, 200][j % 3]},${[255, 220, 240][j % 3]},255` : '255,255,255', (1 - j / 8) * (j ? 0.6 : 1));
      }
      const [x, y] = spot(climb);
      k.star4(x, y, k.px(8, 3.2), t * 4, '#ffffff', 0.95);
    } else {
      // off the top step: it goes out in a ring of sparks
      const q = (climb - N) / 2.5;
      const [x, y] = spot(N - 0.01);
      for (let i = 0; i < 9; i++) {
        const a = (i * TAU) / 9 + 0.3;
        k.glow(x + Math.cos(a) * q * 15 * u, y + Math.sin(a) * q * 15 * u, k.px(3.4, 1.4), '255,255,255', (1 - q) ** 2);
      }
      k.glow(x, y, k.px(12, 4.5) * (1 - q), '255,255,255', 0.7 * (1 - q));
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(8, 32) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(7, 2.6), t + s.ph, '#ffffff', Math.max(0, Math.sin(t * 2.6 + s.ph)));
    }
  },

  // 皇家同花順: 10 J Q K A fanned under the face, crowned
  royal(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(16, t * 0.3, 50 * u, '250,204,21', 0.3);
    k.rays(8, -t * 0.22, 36 * u, '239,68,68', 0.2, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '220,38,38', 0.2 + 0.08 * Math.sin(t * 2.6));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R + 7.5 * u, k.px(0.8, 0.5), 'rgba(253,224,71,.5)');
    k.ring(R, 4.4 * u, k.conic(t * 2, ['#450a0a', '#fef08a', '#dc2626', '#fffbeb', '#7f1d1d', '#facc15', '#450a0a']), '#f59e0b', 16 * u);
    k.ring(R - 1.4 * u, k.px(0.8, 0.5), 'rgba(255,251,235,.8)');
    k.shine(t, 3, 4.4 * u, '254,243,199');
    k.hole();
    // a jewelled band: gold lozenges and rubies, turning slowly
    for (let i = 0; i < 16; i++) {
      const a = t * 0.3 + (i * TAU) / 16;
      const ruby = i % 4 === 0;
      const s = k.px(ruby ? 2.4 : 1.9, ruby ? 1 : 0.8);
      ctx.save(); ctx.translate(...k.at(a, R + 7.5 * u)); ctx.rotate(a);
      ctx.fillStyle = ruby ? '#ef4444' : '#fde047'; ctx.shadowColor = ruby ? '#ef4444' : '#f59e0b'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.moveTo(s * 1.25, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 1.25, 0); ctx.lineTo(0, -s); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // the five cards, rising one after another, a gleam passing along them
    const ranks = ['10', 'J', 'Q', 'K', 'A'];
    const w = k.px(15, 7);
    const h = w * 1.36;
    const gleam = ((t * 1.1) % 3) / 0.32;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (2 - i) * 0.4;
      const lift = Math.max(0, Math.sin(t * 2.2 - i * 0.7)) ** 2 * 3.5 * u;
      const lit = Math.max(0, 1 - Math.abs(gleam - i - 1));
      ctx.save(); ctx.translate(...k.at(a, R + Math.max(14 * u, h / 2 + 1.5) + lift)); ctx.rotate(a - Math.PI / 2);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#fffdf5'); g.addColorStop(1, '#fde68a');
      ctx.fillStyle = g; ctx.strokeStyle = '#b45309'; ctx.lineWidth = k.px(0.7, 0.45); ctx.shadowColor = '#facc15'; ctx.shadowBlur = (6 + 8 * lit) * u;
      const rr = w * 0.16;
      ctx.beginPath(); ctx.moveTo(-w / 2 + rr, -h / 2); ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, rr); ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
      ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr); ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
      if (lit > 0) { ctx.fillStyle = `rgba(255,255,255,${(lit * 0.75).toFixed(3)})`; ctx.fill(); }
      ctx.font = `800 ${(w * (i ? 0.92 : 0.66)).toFixed(2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#b91c1c'; ctx.fillText(ranks[i], 0, -h * 0.1);
      k.suit(0, 0, h * 0.27, w * 0.16, '#b91c1c');
      ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.5 * u, 32 * u, ['#fffbeb', '#facc15', '#92400e'], '#ef4444');
    // gold dust in the air
    ctx.globalCompositeOperation = 'lighter';
    for (const p of k.parts(12, 0.12, () => ({ x: c + rnd(-1, 1) * R * 1.8, y: c + R * 1.2, vy: rnd(0.3, 0.8) * u, ph: rnd(TAU), life: 1 }))) {
      p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.3 * u; p.life -= 0.007;
      if (k.off(p.x, p.y)) k.star4(p.x, p.y, k.px(4, 1.6), t * 2 + p.ph, '#fde68a', p.life * (0.5 + 0.5 * Math.sin(t * 8 + p.ph)) * k.edge(p.x, p.y));
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 常客: the face is the dial — hands sweeping out from behind it, cogs
  // turning, a chime every time the long hand comes round
  clock(k, t) {
    const { ctx, c, u, R } = k;
    const LAP = 6; // seconds for the long hand to go round
    const lap = k.still ? 0 : (t / LAP) % 1;
    const since = lap * LAP; // seconds since it passed twelve
    const chime = k.still ? 0 : Math.max(0, 1 - since / 0.9);
    const long = k.still ? -Math.PI / 2 + TAU * (10 / 60) : -Math.PI / 2 + lap * TAU;
    const short = k.still ? -Math.PI / 2 - TAU * (2 / 12) + 0.09 : -Math.PI / 2 + (t / (LAP * 12)) * TAU;
    const dial = R + 27 * u;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '217,119,6', 0.22 + 0.06 * Math.sin(t * 2) + 0.2 * chime);
    // the time just gone by: a wedge of light trailing the long hand
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(long - 1.9, c, c);
      g.addColorStop(0, 'rgba(251,191,36,0)'); g.addColorStop(1.9 / TAU, 'rgba(251,191,36,.34)'); g.addColorStop(1.9 / TAU + 0.001, 'rgba(251,191,36,0)'); g.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, dial, 0, TAU); ctx.fill();
    }
    if (chime > 0) k.ring(R + (6 + 44 * (1 - chime)) * u, k.px(0.5 + 2.5 * chime, 0.6), `rgba(254,243,199,${chime.toFixed(3)})`, '#f59e0b', 10 * u);
    ctx.globalCompositeOperation = 'source-over';
    // a cog: teeth round a rim, spokes, a hub
    const cog = (x, y, r, teeth, rot, alpha) => {
      const depth = r * 0.22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fde68a'); g.addColorStop(0.5, '#b45309'); g.addColorStop(1, '#451a03');
      ctx.fillStyle = g; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 4 * u;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a = (i * TAU) / teeth;
        const w = TAU / teeth;
        ctx.lineTo(Math.cos(a) * (r - depth), Math.sin(a) * (r - depth));
        ctx.lineTo(Math.cos(a + w * 0.18) * r, Math.sin(a + w * 0.18) * r);
        ctx.lineTo(Math.cos(a + w * 0.46) * r, Math.sin(a + w * 0.46) * r);
        ctx.lineTo(Math.cos(a + w * 0.64) * (r - depth), Math.sin(a + w * 0.64) * (r - depth));
      }
      ctx.closePath();
      // the gaps between the spokes are cut out
      ctx.moveTo(r * 0.56, 0); ctx.arc(0, 0, r * 0.56, 0, TAU, true);
      ctx.fill('evenodd'); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = Math.max(r * 0.13, 0.6); ctx.beginPath();
      for (let i = 0; i < 3; i++) { ctx.moveTo(Math.cos((i * TAU) / 6) * r * 0.58, Math.sin((i * TAU) / 6) * r * 0.58); ctx.lineTo(-Math.cos((i * TAU) / 6) * r * 0.58, -Math.sin((i * TAU) / 6) * r * 0.58); }
      ctx.stroke();
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    };
    // the escapement: the cogs go round in ticks, four a second
    const tk = t * 4;
    const tick = k.still ? 0.4 : Math.floor(tk) + Math.min(1, (tk % 1) * 3.2) ** 0.5;
    const big = k.px(14, 5.6);
    const small = k.px(9.5, 3.9);
    const [gx, gy] = k.at(0.78, R + 30 * u + big * 0.5);
    cog(gx, gy, big, 10, tick * 0.16, 0.95);
    cog(gx - (big + small) * 0.86, gy + (big + small) * 0.38, small, 7, -tick * 0.16 * (10 / 7) + 0.25, 0.9);
    const [hx, hy] = k.at(-2.3, R + 30 * u + small * 0.5);
    cog(hx, hy, small, 7, -tick * 0.2, 0.85);
    // the dial round the face: a bezel, minute marks, the hours heavier
    k.ring(dial, k.px(1.3, 0.6), '#fbbf24', '#f59e0b', 6 * u);
    k.ring(dial + 2.6 * u, k.px(0.7, 0.4), 'rgba(253,230,138,.55)');
    const marks = u < 0.36 ? 12 : 60;
    ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = '#f59e0b';
    for (let i = 0; i < marks; i++) {
      const a = -Math.PI / 2 + (i * TAU) / marks;
      const hour = i % (marks / 12) === 0;
      const quarter = i % (marks / 4) === 0;
      // the mark the hand is passing lights up; all of them at the chime
      const near = Math.max(0, Math.cos(long - a)) ** 24;
      ctx.globalAlpha = Math.min(1, (hour ? 0.75 : 0.4) + near + chime * 0.6);
      ctx.strokeStyle = near > 0.3 || chime > 0.3 ? '#fffbeb' : '#fde68a'; ctx.shadowBlur = (hour ? 4 : 0) * u + near * 8 * u;
      ctx.lineWidth = k.px(quarter ? 2.4 : hour ? 1.6 : 0.8, quarter ? 1 : hour ? 0.7 : 0.4);
      ctx.beginPath(); ctx.moveTo(...k.at(a, dial - (quarter ? 7.5 : hour ? 6 : 3.5) * u)); ctx.lineTo(...k.at(a, dial - 1.8 * u)); ctx.stroke();
    }
    ctx.restore();
    k.ring(R, 4 * u, k.conic(t * 1.2, ['#292524', '#fde68a', '#b45309', '#fffbeb', '#44403c', '#fbbf24', '#292524']), '#d97706', 14 * u);
    k.ring(R - 1.3 * u, k.px(0.8, 0.5), 'rgba(255,251,235,.75)');
    k.shine(t, 2.2, 4 * u, '254,243,199');
    // the hands: they start behind the face, so only their far ends show
    const hand = (a, len, hw, alpha) => {
      if (alpha <= 0) return;
      ctx.save(); ctx.translate(c, c); ctx.rotate(a); ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#b45309'); g.addColorStop(0.7, '#fde68a'); g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8 * u;
      const neck = len - hw * 7;
      ctx.beginPath(); ctx.moveTo(0, -hw); ctx.lineTo(neck, -hw); ctx.lineTo(neck + hw * 2.2, -hw * 3); ctx.lineTo(len, 0);
      ctx.lineTo(neck + hw * 2.2, hw * 3); ctx.lineTo(neck, hw); ctx.lineTo(0, hw); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    // the long hand leaves afterimages behind it
    for (let j = 5; j >= 1; j--) hand(long - j * 0.11, R + 25 * u, k.px(1.1, 0.5), k.still ? 0 : 0.3 * (1 - j / 6));
    hand(short, R + 14 * u, k.px(1.5, 0.65), 1);
    hand(long, R + 25 * u, k.px(1.1, 0.5), 1);
    k.hole();
    // a jewel at twelve
    const [jx, jy] = k.at(-Math.PI / 2, dial);
    ctx.save(); ctx.translate(jx, jy); ctx.fillStyle = '#fffbeb'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = (8 + 10 * chime) * u;
    const js = k.px(3.4, 1.5) * (1 + 0.5 * chime);
    ctx.beginPath(); ctx.moveTo(0, -js * 1.4); ctx.lineTo(js, 0); ctx.lineTo(0, js * 1.4); ctx.lineTo(-js, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    // the tip of the long hand burns
    const [tx, ty] = k.at(long, R + 25 * u);
    k.glow(tx, ty, k.px(7, 2.8), '253,230,138', 0.8);
    k.star4(tx, ty, k.px(7, 2.8), t * 2, '#ffffff', 0.9);
    // motes of time going the other way
    for (const s of k.fixed(9, () => ({ a: rnd(TAU), r: rnd(6, 24), v: rnd(0.15, 0.4), ph: rnd(TAU) }), 'motes')) {
      const [x, y] = k.at(s.a - t * s.v, R + s.r * u);
      k.glow(x, y, k.px(2, 0.9), '253,230,138', 0.35 + 0.5 * Math.max(0, Math.sin(t * 2.4 + s.ph)));
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 主辦人: marquee lights, bunting, and confetti cannons going off
  carnival(k, t) {
    const { ctx, c, u, R, S } = k;
    const cols = ['#fde047', '#f472b6', '#67e8f9', '#86efac', '#c4b5fd'];
    k.rays(12, t * 0.3, 40 * u, '244,114,182', 0.2);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '236,72,153', 0.2 + 0.07 * Math.sin(t * 2.4));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.2 * u, k.conic(t * 2.2, ['#701a75', '#fbcfe8', '#ec4899', '#fef08a', '#0e7490', '#67e8f9', '#701a75']), '#ec4899', 14 * u);
    // candy stripes turning on the ring
    ctx.save(); ctx.setLineDash([3 * u, 3.4 * u]); ctx.lineDashOffset = -t * 9 * u; k.ring(R, 4.2 * u, 'rgba(255,255,255,.3)'); ctx.restore();
    k.shine(t, 3.4, 4.2 * u, '253,242,248');
    k.hole();
    // bunting over the top: a string of pennants, swaying
    const flags = 9;
    ctx.save(); ctx.strokeStyle = 'rgba(253,242,248,.7)'; ctx.lineWidth = k.px(0.7, 0.4);
    ctx.beginPath(); ctx.arc(c, c, R + 14.5 * u, Math.PI + 0.42, TAU - 0.42); ctx.stroke();
    for (let i = 0; i < flags; i++) {
      const a = Math.PI + 0.5 + (i * (Math.PI - 1)) / (flags - 1);
      const sway = Math.sin(t * 2.4 + i * 0.9) * 0.16;
      const len = k.px(13, 5);
      ctx.save(); ctx.translate(...k.at(a, R + 14.5 * u)); ctx.rotate(a + sway);
      const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, cols[i % 5]); g.addColorStop(1, 'rgba(255,255,255,.85)');
      ctx.fillStyle = g; ctx.shadowColor = cols[i % 5]; ctx.shadowBlur = 4 * u;
      ctx.beginPath(); ctx.moveTo(0, -len * 0.36); ctx.lineTo(len, 0); ctx.lineTo(0, len * 0.36); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    // marquee bulbs: the light runs round them
    for (let i = 0; i < 16; i++) {
      const [x, y] = k.at((i * TAU) / 16, R + 8 * u);
      const ph = (((t * 9 - i) % 4) + 4) % 4;
      const on = k.still ? 1 : Math.max(0.28, 1 - ph / 2.2);
      const r = k.px(2.9, 1.2);
      ctx.globalCompositeOperation = 'lighter';
      k.glow(x, y, r * 3, i % 2 ? '253,224,71' : '255,255,255', 0.5 * on);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * on; ctx.fillStyle = i % 2 ? '#fde047' : '#fffbeb';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.32, 0, TAU); ctx.fill(); ctx.restore();
    }
    // one piece of confetti: a paper square turning over, a dot, or a curl
    const piece = (p, alpha) => {
      const w = k.px(5, 2) * p.z;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = p.col; ctx.strokeStyle = p.col;
      if (p.kind === 0) ctx.fillRect(-w / 2, (-w / 2) * Math.abs(Math.cos(p.rot * 1.7)) - 0.3, w, w * Math.abs(Math.cos(p.rot * 1.7)) + 0.6);
      else if (p.kind === 1) { ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, TAU); ctx.fill(); } else {
        ctx.lineWidth = k.px(1.1, 0.6); ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i <= 8; i++) ctx.lineTo((i - 4) * w * 0.3, Math.sin(i * 1.3 + p.rot * 2) * w * 0.35);
        ctx.stroke();
      }
      ctx.restore();
    };
    if (k.still) {
      for (const p of k.fixed(16, (i) => {
        const [x, y] = k.at(rnd(TAU), R + rnd(18, 40) * u);
        return { x, y, rot: rnd(TAU), z: rnd(0.8, 1.3), kind: i % 3, col: cols[i % 5] };
      }, 'scatter')) piece(p, 0.95);
      return;
    }
    // a cannon at each lower corner, taking turns
    const shot = Math.floor(t / 1.3);
    if (S.shot !== shot) {
      S.shot = shot;
      const side = shot % 2 ? 1 : -1;
      const [mx, my] = k.at(Math.PI / 2 - side * 0.95, R + 34 * u);
      S.bang = { x: mx, y: my, life: 1 };
      for (let i = 0; i < 28; i++) {
        S.parts.push({ x: mx, y: my, vx: -side * rnd(0.1, 1.5) * u, vy: -rnd(2.4, 5) * u, rot: rnd(TAU), spin: rnd(-0.25, 0.25), z: rnd(0.8, 1.3), kind: Math.floor(rnd(3)), col: cols[Math.floor(rnd(5))], life: 1, d: rnd(0.009, 0.014) });
      }
    }
    if (S.bang && S.bang.life > 0) {
      ctx.globalCompositeOperation = 'lighter';
      k.glow(S.bang.x, S.bang.y, k.px(16, 6) * (1.3 - S.bang.life * 0.5), '255,255,255', 0.7 * S.bang.life);
      ctx.globalCompositeOperation = 'source-over';
      S.bang.life -= 0.1;
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy = p.vy * 0.975 + 0.075 * u; p.rot += p.spin; p.life -= p.d;
      // once it is falling it flutters
      if (p.vy > 0) p.x += Math.sin(t * 4 + p.rot) * 0.3 * u;
      if (k.off(p.x, p.y)) piece(p, Math.min(1, p.life * 3) * k.edge(p.x, p.y));
    }
    // and some always coming down from above
    for (const p of k.parts(10, 0.12, () => ({ x: c + rnd(-1, 1) * R * 1.9, y: c - R * 2, vy: rnd(0.5, 1.1) * u, rot: rnd(TAU), spin: rnd(-0.15, 0.15), z: rnd(0.7, 1.1), kind: Math.floor(rnd(3)), col: cols[Math.floor(rnd(5))], life: 1 }), 'drizzle')) {
      p.y += p.vy; p.x += Math.sin(t * 3 + p.rot) * 0.4 * u; p.rot += p.spin; p.life -= 0.006;
      if (p.y > c + R * 2.1) p.life = 0;
      if (k.off(p.x, p.y)) piece(p, Math.min(1, p.life * 4) * k.edge(p.x, p.y));
    }
  },

  // ── 王座框: one per 本月王座, each under a small crown of its own colour ──

  // 本月印鈔機: banknotes fluttering up, green-gold
  mint(k, t) {
    const { ctx, c, u, R, D, S } = k;
    k.rays(14, t * 0.28, 40 * u, '52,211,153', 0.26);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '16,185,129', 0.22 + 0.07 * Math.sin(t * 2.6));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setLineDash([4 * u, 3 * u]); ctx.lineDashOffset = -t * 16 * u;
    k.ring(R + 7 * u, k.px(1.8, 0.7), '#fde68a', '#f59e0b', 5 * u); ctx.restore();
    k.ring(R, 4.2 * u, k.conic(t * 1.8, ['#064e3b', '#a7f3d0', '#10b981', '#fef3c7', '#047857', '#fde68a', '#064e3b']), '#34d399', 14 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(236,253,245,.8)');
    k.shine(t, 2.8, 4.2 * u, '209,250,229');
    k.hole();
    // one banknote: a border inside its edge, a medallion in the middle,
    // darker on the back; `flip` turns it over
    const note = (x, y, rot, flip, alpha, z = 1) => {
      if (alpha <= 0) return;
      const w = k.px(16, 6.4) * z;
      const h = Math.max(w * 0.1, Math.abs(flip) * w * 0.54);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = Math.min(1, alpha);
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      if (flip > 0) { g.addColorStop(0, '#d1fae5'); g.addColorStop(0.5, '#6ee7b7'); g.addColorStop(1, '#34d399'); } else { g.addColorStop(0, '#34d399'); g.addColorStop(1, '#047857'); }
      ctx.fillStyle = g; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 5 * u; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#065f46'; ctx.lineWidth = k.px(0.7, 0.4); ctx.strokeRect(-w / 2, -h / 2, w, h);
      if (h > w * 0.3) {
        ctx.strokeStyle = 'rgba(6,95,70,.55)'; ctx.strokeRect(-w * 0.42, -h * 0.34, w * 0.84, h * 0.68);
        ctx.fillStyle = '#065f46'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.15, h * 0.3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d1fae5'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.07, h * 0.15, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    };
    if (k.still) {
      for (let i = 0; i < 5; i++) {
        const [x, y] = k.at(0.45 + i * 0.56, R + 13 * u);
        note(x, y, Math.sin(0.9 + i) * 0.5, i % 2 ? -0.9 : 0.9, 1);
      }
    } else {
      // the press: a batch of five shot up from under the face every so
      // often, and a trickle between; they slow, and flutter on upwards
      const batch = Math.floor(t / 1.6);
      if (S.batch !== batch) {
        S.batch = batch;
        for (let i = 0; i < 5; i++) {
          S.parts.push({ x: c + (i - 2) * R * 0.42 + rnd(-2, 2) * u, y: c + R * 1.75, vx: (i - 2) * 0.2 * u, vy: rnd(1.7, 2.6) * u, ph: rnd(TAU), sp: rnd(2, 4), z: rnd(0.8, 1.15), life: 1 });
        }
      }
      if (S.parts.length < 12 && Math.random() < 0.06) {
        S.parts.push({ x: c + rnd(-1, 1) * R * 1.5, y: c + R * 1.7, vx: 0, vy: rnd(0.75, 1.25) * u, ph: rnd(TAU), sp: rnd(1.5, 3), z: rnd(0.7, 1), life: 1 });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.y -= p.vy; p.vy = Math.max(0.7 * u, p.vy * 0.985); p.x += p.vx + Math.sin(t * 2 + p.ph) * 0.4 * u; p.life -= 0.007;
        // never across the face
        if (k.off(p.x, p.y)) note(p.x, p.y, Math.sin(t + p.ph) * 0.5, Math.cos(t * p.sp + p.ph), Math.min(1, p.life * 2.5) * k.edge(p.x, p.y), p.z);
      }
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.4 * u, 32 * u, ['#ecfdf5', '#34d399', '#065f46'], '#fde68a');
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(2, 26) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.5 + s.ph)));
    }
  },

  // 本月大善人: a halo, hearts rising, warm rose-gold
  grace(k, t) {
    const { ctx, c, u, R, D, S } = k;
    k.rays(12, -t * 0.22, 44 * u, '253,186,116', 0.24, 0.42);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '251,113,133', 0.2 + 0.07 * Math.sin(t * 2));
    k.glow(c, c - R * 0.9, R * 1.1, '254,243,199', 0.2);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R + 6.5 * u, k.px(1.2, 0.6), 'rgba(254,205,211,.75)', '#fb7185', 6 * u);
    k.ring(R, 4 * u, k.conic(t * 1.4, ['#9f1239', '#fecdd3', '#fb7185', '#fef3c7', '#e11d48', '#fde68a', '#9f1239']), '#fb7185', 14 * u);
    k.ring(R - 1.4 * u, k.px(0.7, 0.4), 'rgba(255,241,242,.8)');
    k.shine(t, 2.4, 4 * u, '255,228,230');
    k.hole();
    // an angel's wings at the shoulders: long feathers, shorter ones over them
    const flap = Math.sin(t * 2);
    const ROWS = [
      [5, -1.15, 0.27, 36, 3.6, 4.4, ['#ffffff', '#ffe4e6', 'rgba(253,164,175,.6)']],
      [4, -0.78, 0.33, 20, 1.8, 4, ['#ffffff', '#fff1f2', '#fecdd3']],
    ];
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c); ctx.scale(side, 1); ctx.translate(Math.cos(-0.1) * R, Math.sin(-0.1) * R); ctx.rotate(flap * 0.1);
      for (const [n, first, step, long, less, hw, cols] of ROWS) {
        for (let i = n - 1; i >= 0; i--) {
          const len = k.px(long - i * less, (long - i * less) * 0.36);
          ctx.save(); ctx.rotate(first + i * step * (1 - 0.12 * flap));
          const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, cols[0]); g.addColorStop(0.6, cols[1]); g.addColorStop(1, cols[2]);
          ctx.fillStyle = g; ctx.shadowColor = '#fda4af'; ctx.shadowBlur = 4 * u; k.leaf(len, k.px(hw, hw * 0.4), 0.55); ctx.fill(); ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(190,18,60,.3)'; ctx.lineWidth = k.px(0.5, 0.35); ctx.beginPath(); ctx.moveTo(len * 0.08, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }
    // a heart, lit from the upper left
    const heart = (x, y, s, a, col) => {
      if (a <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, a);
      const g = ctx.createLinearGradient(0, -5, 0, 3); g.addColorStop(0, '#ffe4e6'); g.addColorStop(0.6, col); g.addColorStop(1, '#be123c');
      ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-6, -2, -3, -6, 0, -3); ctx.bezierCurveTo(3, -6, 6, -2, 0, 3); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(-2, -3, 0.8, 0, TAU); ctx.fill();
      ctx.restore();
    };
    if (k.still) {
      for (let i = 0; i < 5; i++) {
        const [x, y] = k.at(0.45 + i * 0.56, R + (11 + (i % 2) * 7) * u);
        heart(x, y, Math.max(2 * u, 0.6), 0.9, i % 2 ? '#fda4af' : '#fb7185');
      }
    } else {
      if (S.parts.length < 12 && Math.random() < 0.14) {
        S.parts.push({ x: c + rnd(-1, 1) * R * 1.5, y: c + R * 1.5, vy: rnd(0.7, 1.2) * u, ph: rnd(TAU), z: rnd(1.5, 2.6), life: 1 });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.y -= p.vy; p.x += Math.sin(t * 2.4 + p.ph) * 0.35 * u; p.life -= 0.007;
        // never across the face
        if (k.off(p.x, p.y)) heart(p.x, p.y, Math.max(p.z * u, 0.6) * (1 + 0.08 * Math.sin(t * 6 + p.ph)), Math.min(1, p.life * 2.2) * k.edge(p.x, p.y), p.z > 2 ? '#fb7185' : '#fda4af');
      }
    }
    // the halo over the head: a ring of light, a spark going round it
    const hy = c - D / 2 - 7 * u + Math.sin(t * 2) * 1.5 * u;
    const hx = k.px(18, 6.5);
    const hz = hx * 0.29;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, hy, hx * 1.5, '254,240,138', 0.3 + 0.1 * Math.sin(t * 3));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 10 * u; ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = k.px(2.8, 1.1);
    ctx.beginPath(); ctx.ellipse(c, hy, hx, hz, 0, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(245,158,11,.7)'; ctx.lineWidth = k.px(0.8, 0.4);
    ctx.beginPath(); ctx.ellipse(c, hy, hx, hz, 0, 0, TAU); ctx.stroke(); ctx.restore();
    k.star4(c + Math.cos(t * 2.4) * hx, hy + Math.sin(t * 2.4) * hz, k.px(6.5, 2.6), t * 2, '#fffbeb', 0.95);
  },

  // 本月老闆: shock rings pulsing out, red and gold
  tycoon(k, t) {
    const { ctx, c, u, R, D, S } = k;
    S.tick++;
    S.flash = (S.flash || 0) * 0.85;
    k.rays(10, t * 0.5, 46 * u, '248,113,113', 0.26, 0.36);
    k.rays(10, -t * 0.35, 30 * u, '251,191,36', 0.24, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '220,38,38', 0.22 + 0.1 * Math.sin(t * 3.4) + 0.2 * S.flash);
    // his aura: tongues of red and gold leaving the ring all round and climbing
    if (k.still) {
      for (let i = 0; i < 12; i++) {
        const [x, y] = k.at((i * TAU) / 12, R + 5 * u);
        k.glow(x, y - (i % 2 ? 4 : 9) * u, Math.max((i % 2 ? 9 : 12) * u, 3.2), i % 3 ? '239,68,68' : '245,158,11', 0.3);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = rnd(TAU);
        S.parts.push({ x: c + Math.cos(a) * (R + 2 * u), y: c + Math.sin(a) * (R + 2 * u), vx: Math.cos(a) * 0.35 * u, vy: -rnd(1.1, 2.6) * u, life: 1, d: rnd(0.026, 0.048), s: Math.max(rnd(8, 14) * u, 2.8), gold: Math.random() < 0.35 });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.vx += rnd(-0.1, 0.1) * u; p.life -= p.d;
        const h = p.life;
        if (h <= 0) continue;
        const rgb = p.gold ? (h > 0.5 ? '255,236,170' : '245,158,11') : (h > 0.7 ? '255,220,200' : h > 0.35 ? '239,68,68' : '127,29,29');
        k.glow(p.x, p.y, p.s * (0.4 + h * 0.7), rgb, 0.42 * h * k.edge(p.x, p.y));
      }
    }
    // rings bursting outwards, one after another
    for (let i = 0; i < 3; i++) {
      const q = k.still ? (0.25 + i * 0.3) : ((t * 0.55 + i / 3) % 1);
      k.ring(R + (4 + q * 30) * u, k.px(2.6 - q * 2, 0.5), `rgba(252,165,165,${(0.75 * (1 - q)).toFixed(3)})`, '#ef4444', 8 * u);
    }
    // now and then red lightning cracks off the ring
    if (k.still ? !S.bolts.length : S.tick % 5 === 0) {
      S.bolts = [];
      if (k.still || Math.random() < 0.4) {
        const a = k.still ? -2.4 : rnd(TAU);
        const pts = [];
        for (let i = 0; i <= 7; i++) pts.push(k.at(a + (i ? rnd(-0.12, 0.12) : 0), R + i * 5.5 * u));
        S.bolts.push(pts);
        if (!k.still) S.flash = 1;
      }
    }
    ctx.save(); ctx.lineJoin = 'round';
    for (const pts of S.bolts) {
      for (const [w, col, blur] of [[k.px(2.6, 1.1), 'rgba(252,165,165,.9)', 12 * u], [k.px(1, 0.5), '#fff7cc', 4 * u]]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = blur;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.4 * u, k.conic(-t * 2.4, ['#450a0a', '#fca5a5', '#dc2626', '#fde68a', '#7f1d1d', '#f59e0b', '#450a0a']), '#ef4444', 16 * u);
    k.ring(R - 1.5 * u, k.px(0.7, 0.4), 'rgba(254,243,199,.8)');
    k.shine(t, 3.2, 4.4 * u, '254,226,226');
    k.hole();
    // gold studs round the ring, lit in turn
    for (let i = 0; i < 12; i++) {
      const [x, y] = k.at((i * TAU) / 12 + t * 0.4, R + 6.5 * u);
      const on = 0.45 + 0.55 * Math.max(0, Math.sin(t * 4 - i * 0.9));
      const r = k.px(1.9, 0.85);
      ctx.save(); ctx.globalAlpha = on; ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); ctx.fill(); ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.6) * 1.6 * u, 36 * u, ['#fff7cc', '#f59e0b', '#7f1d1d'], '#ef4444');
    for (const s of k.fixed(7, () => ({ a: rnd(TAU), r: rnd(6, 28) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t * 1.4 + s.ph, '#fecaca', Math.max(0, Math.sin(t * 3 + s.ph)));
    }
  },

  // 本月獵頭王: a scope locking on, crimson
  reticle(k, t) {
    const { ctx, c, u, R, D } = k;
    // one acquisition every 2.6 s: the brackets close in, lock (a ping
    // goes out), hold, and let go
    const cyc = k.still ? 0.62 : (t / 2.6) % 1;
    const lock = cyc < 0.5 ? cyc / 0.5 : cyc < 0.8 ? 1 : 1 - (cyc - 0.8) / 0.2;
    const ease = lock * lock * (3 - 2 * lock);
    const ping = cyc >= 0.5 && cyc < 0.8 ? 1 - (cyc - 0.5) / 0.3 : 0;
    const sweepAt = t * 2.2;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '244,63,94', 0.2 + 0.08 * Math.sin(t * 3) + 0.15 * ping);
    // radar sweep
    if (typeof ctx.createConicGradient === 'function') {
      const sweep = ctx.createConicGradient(sweepAt, c, c);
      sweep.addColorStop(0, 'rgba(251,113,133,0)'); sweep.addColorStop(0.8, 'rgba(251,113,133,0)'); sweep.addColorStop(1, 'rgba(251,113,133,.5)');
      ctx.fillStyle = sweep; ctx.beginPath(); ctx.arc(c, c, R + 24 * u, 0, TAU); ctx.fill();
    }
    if (ping > 0) k.ring(R + (4 + 34 * (1 - ping)) * u, k.px(0.5 + 2.5 * ping, 0.6), `rgba(255,241,242,${ping.toFixed(3)})`, '#f43f5e', 10 * u);
    ctx.globalCompositeOperation = 'source-over';
    // the cross hairs: fine lines right across (behind the face), dots along them
    ctx.save(); ctx.strokeStyle = 'rgba(254,205,211,.5)'; ctx.fillStyle = 'rgba(254,205,211,.85)'; ctx.lineWidth = k.px(0.8, 0.4);
    for (const a of [0, Math.PI / 2]) { ctx.beginPath(); ctx.moveTo(...k.at(a, R + 31 * u)); ctx.lineTo(...k.at(a + Math.PI, R + 31 * u)); ctx.stroke(); }
    for (let i = 0; i < 4; i++) {
      for (let n = 1; n <= 3; n++) {
        const [x, y] = k.at((i * TAU) / 4, R + (7 + n * 6.5) * u);
        ctx.beginPath(); ctx.arc(x, y, k.px(0.9, 0.5), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // range rings: the edge of the scope, a ring of ticks, a ring of segments turning
    k.ring(R + 24 * u, k.px(0.8, 0.4), 'rgba(251,113,133,.5)');
    ctx.save(); ctx.setLineDash([1.4 * u, 4.2 * u]); ctx.lineDashOffset = t * 12 * u;
    k.ring(R + 13 * u, k.px(1.4, 0.6), 'rgba(254,205,211,.8)'); ctx.restore();
    ctx.save(); ctx.setLineDash([9 * u, 2.5 * u, 2 * u, 2.5 * u]); ctx.lineDashOffset = -t * 8 * u;
    k.ring(R + 19 * u, k.px(1.2, 0.6), 'rgba(253,164,175,.6)'); ctx.restore();
    k.ring(R, 3.8 * u, k.conic(t * 1.6, ['#4c0519', '#fda4af', '#e11d48', '#fff1f2', '#881337', '#fb7185', '#4c0519']), '#f43f5e', (14 + 8 * ping) * u);
    k.ring(R - 1.3 * u, k.px(0.7, 0.4), 'rgba(255,241,242,.8)');
    k.shine(t, 3, 3.8 * u, '255,228,230');
    k.hole();
    // four ticks and the brackets between them, turning in as they close
    ctx.save(); ctx.translate(c, c); ctx.rotate((1 - ease) * 0.7);
    ctx.strokeStyle = ping > 0.4 ? '#ffffff' : '#fff1f2'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = (8 + 8 * ping) * u; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      const r0 = R + (12 - ease * 7.5) * u;
      ctx.lineWidth = k.px(2.6, 1); ctx.beginPath(); ctx.moveTo(r0, 0); ctx.lineTo(r0 + 11 * u, 0); ctx.stroke();
      ctx.lineWidth = k.px(1.7, 0.7); ctx.beginPath(); ctx.arc(0, 0, R + (22 - ease * 9) * u, TAU / 8 - 0.24, TAU / 8 + 0.24); ctx.stroke();
    }
    ctx.restore();
    // blips on the scope: each flares as the sweep passes over it
    for (const b of k.fixed(4, () => ({ a: rnd(TAU), r: rnd(9, 21) }), 'blips')) {
      const since = (((sweepAt - b.a) % TAU) + TAU) % TAU;
      const hot = k.still ? 0.6 : Math.max(0, 1 - since / 2.4);
      const [x, y] = k.at(b.a, R + b.r * u);
      const s = k.px(2.4, 1.1);
      ctx.globalCompositeOperation = 'lighter';
      k.glow(x, y, s * 3, '251,113,133', 0.7 * hot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.fillStyle = `rgba(255,228,230,${(0.3 + 0.7 * hot).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.4 * u, 32 * u, ['#fff1f2', '#fb7185', '#881337'], '#fde68a');
  },

  // 本月釘子戶: a sun that never sets, amber
  sunrise(k, t) {
    const { ctx, c, u, R, D, S } = k;
    k.rays(20, t * 0.35, 46 * u, '251,191,36', 0.3, 0.42);
    k.rays(10, -t * 0.2, 30 * u, '253,224,71', 0.26, 0.55);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '249,115,22', 0.24 + 0.08 * Math.sin(t * 2.2));
    // the corona: flame leaving the ring all the way round, streaming outwards
    if (k.still) {
      for (let i = 0; i < 26; i++) {
        const a = (i * TAU) / 26;
        const len = (8 + 6 * Math.sin(i * 1.9) + 4 * Math.sin(i * 0.7)) * u;
        const [x, y] = k.at(a, R + len * 0.5);
        k.glow(x, y, Math.max(2 * u, len * 0.75), '253,186,116', 0.34);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = rnd(TAU);
        const sp = rnd(0.5, 1.3) * u;
        S.parts.push({ x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, vx: Math.cos(a) * sp + rnd(-0.2, 0.2) * u, vy: Math.sin(a) * sp - 0.25 * u, life: 1, d: rnd(0.035, 0.06), s: Math.max(rnd(6, 11) * u, 2.2) });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.x += p.vx; p.y += p.vy; p.life -= p.d;
        const h = p.life;
        if (h > 0) k.glow(p.x, p.y, p.s * (0.4 + h * 0.7), h > 0.75 ? '255,251,235' : h > 0.45 ? '253,224,71' : h > 0.2 ? '249,115,22' : '154,52,18', 0.32 * h);
      }
    }
    // prominences: loops of fire arching off the limb, rising and sinking back
    for (let i = 0; i < 3; i++) {
      const phase = t * 0.22 + i / 3;
      const grow = Math.sin((k.still ? 0.5 : phase % 1) * Math.PI);
      const a = i * 2.2 + Math.floor(phase) * 1.3;
      ctx.save(); ctx.translate(...k.at(a, R + 1 * u)); ctx.rotate(a);
      ctx.strokeStyle = `rgba(253,186,116,${(0.85 * grow).toFixed(3)})`; ctx.lineWidth = k.px(2.2, 0.9); ctx.shadowColor = '#f97316'; ctx.shadowBlur = 8 * u;
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(k.px(14, 5.5) * grow, 0.1), k.px(6.5, 2.6), 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.2 * u, k.conic(t * 1.3, ['#7c2d12', '#fed7aa', '#f97316', '#fef9c3', '#c2410c', '#fbbf24', '#7c2d12']), '#fb923c', 16 * u);
    k.ring(R - 1.5 * u, k.px(0.9, 0.5), 'rgba(255,251,235,.9)', '#fde68a', 5 * u);
    k.shine(t, 2.6, 4.2 * u, '255,237,213');
    k.hole();
    // the days of the month: beads lighting one after another
    for (let i = 0; i < 16; i++) {
      const [x, y] = k.at(-Math.PI / 2 + (i * TAU) / 16, R + 9 * u);
      const on = k.still ? (i % 3 ? 0.5 : 1) : 0.3 + 0.7 * Math.max(0, Math.cos(t * 1.6 - (i * TAU) / 16));
      ctx.save(); ctx.globalAlpha = on; ctx.fillStyle = '#fff7ed'; ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 6 * u;
      ctx.beginPath(); ctx.arc(x, y, k.px(1.8, 0.8), 0, TAU); ctx.fill(); ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2) * 1.4 * u, 32 * u, ['#fffbeb', '#fbbf24', '#9a3412'], '#fff7ed');
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(8, 28) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), k.px(8, 3), t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.2 + s.ph)));
    }
  },
};

/** Frame ids this renderer can draw. */
export const FRAME_FX_IDS = Object.freeze(Object.keys(DRAWERS));

/**
 * Can this frame id be drawn?
 *
 * @param {?string} kind Frame id.
 * @return {boolean}
 */
export function hasFrameFx(kind) {
  return typeof kind === 'string' && Object.hasOwn(DRAWERS, kind);
}

/**
 * A draw function for one avatar: `(t, { still, light }) => void` paints the
 * frame `kind` at time `t` (seconds) on a 2D context whose canvas is
 * `size * FRAME_CANVAS_SCALE` CSS px square (the context already scaled for
 * the device pixel ratio).
 *
 * @param {CanvasRenderingContext2D} ctx 2D context.
 * @param {string} kind Frame id (hasFrameFx).
 * @param {number} size Avatar diameter in CSS px.
 * @return {?function(number, {still?: boolean, light?: boolean}=): void} null
 *   for an unknown frame.
 */
export function createFrameRenderer(ctx, kind, size) {
  if (!ctx || !hasFrameFx(kind)) return null;
  const D = size;
  const C = D * FRAME_CANVAS_SCALE;
  const c = C / 2;
  const u = frameUnit(D);
  const k = {
    ctx, D, C, c, u,
    R: D / 2 + 3 * u, // ring radius, just outside the face
    S: { parts: [], bolts: [], tick: 0, fixed: [] },
    still: false,
  };
  const { R } = k;

  k.glow = (x, y, r, rgb, a) => {
    if (r <= 0 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  // A browser without conic gradients gets the same colours across the ring
  k.conic = (rot, stops) => {
    const g = typeof ctx.createConicGradient === 'function'
      ? ctx.createConicGradient(rot, c, c)
      : ctx.createLinearGradient(c + Math.cos(rot) * R, c + Math.sin(rot) * R, c - Math.cos(rot) * R, c - Math.sin(rot) * R);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  };
  k.ring = (r, w, style, blurColor, blur) => {
    ctx.save(); ctx.lineWidth = w; ctx.strokeStyle = style;
    if (blurColor) { ctx.shadowColor = blurColor; ctx.shadowBlur = blur; }
    ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.stroke(); ctx.restore();
  };
  k.star4 = (x, y, r, rot, color, a) => {
    if (a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = r;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.22 : r;
      const a2 = (i * TAU) / 8;
      ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  k.rays = (n, rot, len, rgb, a, wide = 0.5) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i * TAU) / n;
      const half = (TAU / n) * wide * 0.5;
      const L = R + (i % 2 ? len * 0.62 : len);
      const g = ctx.createRadialGradient(c, c, R * 0.9, c, c, L);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, L, a0 - half, a0 + half); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };
  // A highlight travelling round the ring, the way light runs along polished
  // metal: a streak that tapers out behind (thin and faint at the tail, the
  // ring's own colour in the body, a hairline of white at the head), a small
  // glint where it leads, and a fainter echo on the far side. It fades in and
  // out over the lap instead of popping, then rests before the next one.
  const streak = (head, len, w, rgb, strength) => {
    const N = 20;
    const step = len / N;
    for (let i = 0; i < N; i++) {
      const q = (i + 1) / N; // 0 at the tail → 1 at the head
      const a1 = head - len + i * step;
      // tinted body, widening towards the head
      ctx.lineWidth = w * (0.3 + 0.55 * q);
      ctx.strokeStyle = `rgba(${rgb},${(0.6 * q * q * strength).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(c, c, R, a1, a1 + step * 1.15); ctx.stroke();
      // white core over the leading third
      if (q > 0.66) {
        const h = (q - 0.66) / 0.34;
        ctx.lineWidth = w * 0.26;
        ctx.strokeStyle = `rgba(255,255,255,${(0.9 * h * h * strength).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(c, c, R - w * 0.16, a1, a1 + step * 1.15); ctx.stroke();
      }
    }
  };
  k.shine = (t, speed, w, rgb = '255,255,255') => {
    const a0 = (t * speed) % (TAU * 1.6);
    if (a0 > TAU) return;
    const life = Math.sin((a0 / TAU) * Math.PI);
    if (life <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'butt';
    streak(a0, 1.25, w, rgb, life);
    streak(a0 + Math.PI, 0.7, w * 0.8, rgb, life * 0.4);
    const hx = c + Math.cos(a0) * R;
    const hy = c + Math.sin(a0) * R;
    k.glow(hx, hy, w * 1.5, rgb, 0.55 * life);
    ctx.restore();
    k.star4(hx, hy, w * 1.25, a0 * 0.5, '#ffffff', 0.9 * life);
  };
  // The usual start of a frame: a glow behind, the ring in its colours, the
  // highlight running round it
  k.base = (t, { glow, stops, shine, speed = 1.6, width = 4 }) => {
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, glow, 0.2 + 0.07 * Math.sin(t * 2.4));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, width * u, k.conic(t * speed, stops), `rgb(${glow})`, 14 * u);
    k.shine(t, speed * 1.2 + 0.8, width * u, shine);
  };
  // Is a point clear of the face? (particles never cross it)
  k.off = (x, y) => Math.hypot(x - c, y - c) >= D / 2 + 2 * u;
  // The moving particles of a frame: at most `max`, a new one (make()) with
  // probability `rate` per draw, gone when their life runs out. None in a
  // still picture.
  k.parts = (max, rate, make, key = 'parts') => {
    if (k.still) return [];
    const list = (k.S[key] ||= []);
    if (list.length < max && Math.random() < rate) list.push(make());
    return (k.S[key] = list.filter((p) => p.life > 0));
  };
  // `n` effect units, never under `min` px: small avatars keep the detail
  k.px = (n, min = 0) => Math.max(n * u, min);
  // The point at angle `a`, `r` from the avatar's centre
  k.at = (a, r) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
  // 1 well inside the canvas, falling to 0 at its edge: what flies off is
  // faded out there instead of being cut off flat
  k.edge = (x, y) => Math.max(0, Math.min(1, Math.min(x, y, C - x, C - y) / (C * 0.07)));
  // The path of a leaf (a feather, a petal) lying along +x from the origin of
  // the current transform: `len` long, `hw` to each side at its widest, which
  // is `belly` of the way along. Ready to fill.
  k.leaf = (len, hw, belly = 0.4) => {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * belly, -hw * 2, len, 0);
    ctx.quadraticCurveTo(len * belly, hw * 2, 0, 0);
    ctx.closePath();
  };
  // The path of a blade of light between two points: `w` thick in the middle,
  // a needle point at each end, bowed sideways by `bend` (a crescent)
  k.lens = (x0, y0, x1, y1, w, bend = 0) => {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / L;
    const ny = (x1 - x0) / L;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx * (bend * 2 + w), my + ny * (bend * 2 + w), x1, y1);
    ctx.quadraticCurveTo(mx + nx * (bend * 2 - w), my + ny * (bend * 2 - w), x0, y0);
    ctx.closePath();
  };
  // A light going round the avatar at radius `r`, head at angle `a`, its tail
  // `n` dots long fading out behind it (`step` < 0: it travels the other way)
  k.comet = (a, r, { n = 14, step = 0.06, size = 5, rgb, head = '255,255,255', alpha = 0.85 }) => {
    for (let j = n - 1; j >= 0; j--) {
      const q = 1 - j / n;
      const [x, y] = k.at(a - j * step, r);
      k.glow(x, y, Math.max(size * u * (0.3 + 0.7 * q), 0.8), j ? rgb : head, alpha * q * (j ? q : 1));
    }
  };
  // A spark in flight: a short streak along the way it is going
  k.spark = (p, rgb, w, stretch = 3) => {
    if (p.life <= 0) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = `rgba(${rgb},${(Math.min(1, p.life) * k.edge(p.x, p.y)).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(p.x - p.vx * stretch, p.y - p.vy * stretch); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore();
  };
  // A card suit as a shape (0 ♠, 1 ♥, 2 ♣, 3 ♦), `s` half its height: the
  // same on every device, where a font may swap in an emoji
  k.suit = (n, x, y, s, color) => {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = s * 0.5;
    ctx.beginPath();
    if (n === 3) {
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.22, -s * 0.25, s * 0.74, 0); ctx.quadraticCurveTo(s * 0.22, s * 0.25, 0, s);
      ctx.quadraticCurveTo(-s * 0.22, s * 0.25, -s * 0.74, 0); ctx.quadraticCurveTo(-s * 0.22, -s * 0.25, 0, -s);
    } else if (n === 2) {
      for (const [cx, cy] of [[0, -s * 0.45], [-s * 0.5, s * 0.18], [s * 0.5, s * 0.18]]) { ctx.moveTo(cx + s * 0.44, cy); ctx.arc(cx, cy, s * 0.44, 0, TAU); }
      ctx.moveTo(-s * 0.32, s); ctx.quadraticCurveTo(0, s * 0.65, 0, 0); ctx.quadraticCurveTo(0, s * 0.65, s * 0.32, s); ctx.closePath();
    } else {
      // a heart; the spade is the same turned over, on a stem
      const f = n === 1 ? 1 : -1;
      ctx.moveTo(0, f * s * 0.92);
      ctx.bezierCurveTo(-s * 1.3, f * s * 0.1, -s * 0.75, -f * s * 1.0, 0, -f * s * 0.38);
      ctx.bezierCurveTo(s * 0.75, -f * s * 1.0, s * 1.3, f * s * 0.1, 0, f * s * 0.92);
      if (n === 0) { ctx.moveTo(-s * 0.34, s); ctx.quadraticCurveTo(0, s * 0.7, 0, s * 0.1); ctx.quadraticCurveTo(0, s * 0.7, s * 0.34, s); ctx.closePath(); }
    }
    ctx.fill(); ctx.restore();
  };
  // One character (a suit, a rank, a mark) centred on a point
  k.glyph = (text, x, y, size, color, rot = 0, alpha = 1) => {
    if (alpha <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = Math.min(1, alpha);
    ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = size * 0.35;
    ctx.fillText(text, 0, size * 0.06); ctx.restore();
  };
  // A small crown floating over the head (王座框): [light, body, dark] and
  // the colour of its gems. `cy` is its base line.
  k.crown = (cy, width, [light, body, dark], gem) => {
    const w = Math.max(width, 11);
    const h = w * 0.62;
    const half = w / 2;
    const band = h * 0.26;
    const lean = w * 0.05;
    ctx.save(); ctx.translate(c, cy + 2 * u); ctx.lineJoin = 'round';
    ctx.shadowColor = body; ctx.shadowBlur = 9 * u;
    // three peaks, the valleys between them curved
    let g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, light); g.addColorStop(0.55, body); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.strokeStyle = light; ctx.lineWidth = Math.max(0.8 * u, 0.4);
    ctx.beginPath(); ctx.moveTo(-half, -band); ctx.lineTo(-half - lean, -h * 0.72);
    ctx.quadraticCurveTo(-half * 0.64, -h * 0.5, -half * 0.5, -h * 0.32);
    ctx.quadraticCurveTo(-half * 0.26, -h * 0.55, 0, -h);
    ctx.quadraticCurveTo(half * 0.26, -h * 0.55, half * 0.5, -h * 0.32);
    ctx.quadraticCurveTo(half * 0.64, -h * 0.5, half + lean, -h * 0.72);
    ctx.lineTo(half, -band); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // the band under them
    g = ctx.createLinearGradient(0, -band, 0, 0); g.addColorStop(0, light); g.addColorStop(0.5, body); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.fillRect(-half, -band, w, band); ctx.strokeRect(-half, -band, w, band);
    // a pearl on each peak; on the band a big stone between two small ones
    const stone = (x, y, r, col) => {
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 5 * u; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.36, 0, TAU); ctx.fill();
    };
    const pearl = Math.max(w * 0.055, 0.9);
    stone(0, -h, pearl * 1.15, '#fffbeb'); stone(-half - lean, -h * 0.72, pearl, '#fffbeb'); stone(half + lean, -h * 0.72, pearl, '#fffbeb');
    stone(0, -band / 2, Math.max(band * 0.4, 0.9), gem);
    stone(-half * 0.56, -band / 2, Math.max(band * 0.27, 0.6), gem); stone(half * 0.56, -band / 2, Math.max(band * 0.27, 0.6), gem);
    ctx.restore();
  };
  // Everything drawn so far sits BEHIND the face
  k.hole = () => {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(c, c, D / 2 - 0.5, 0, TAU); ctx.fill(); ctx.restore();
  };
  // Things placed once per avatar (sparkle spots, the star field)
  k.fixed = (n, make, key = 'fixed') => {
    const list = (k.S[key] ||= []);
    if (!list.length) for (let i = 0; i < n; i++) list.push(make(i));
    return list;
  };

  return (t, { still = false, light = false } = {}) => {
    k.still = still;
    ctx.clearRect(0, 0, C, C);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Glows are additive: on a light page they wash out, so they get a dark
    // backing to shine against, close around the ring like a soft shadow
    if (light) {
      const g = ctx.createRadialGradient(c, c, R, c, c, R + 26 * u);
      g.addColorStop(0, 'rgba(15,23,42,.55)'); g.addColorStop(0.45, 'rgba(15,23,42,.2)'); g.addColorStop(1, 'rgba(15,23,42,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R + 26 * u, 0, TAU); ctx.fill();
    }
    DRAWERS[kind](k, t);
  };
}

// ── The shared loop ─────────────────────────────────────────────────

const entries = new Set();
let rafId = 0;
let lastDraw = 0;
let startedAt = 0;
let watching = false;
let visibility = null;
// ~60 draws a second at most, so a 120Hz screen doesn't run the particles
// (which move per draw) twice as fast
const MIN_FRAME_MS = 14;

const root = () => (typeof document !== 'undefined' ? document.documentElement : null);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Should frames stand still for this viewer: 簡化特效 is on. (Only the
 * switch; not the system's reduced-motion setting, see the top of the file.)
 *
 * @return {boolean}
 */
export function frameFxStill() {
  return root()?.getAttribute('data-fx') === 'lite';
}

const lightMode = () => root()?.getAttribute('data-mode') === 'light';
const animated = (entry, still) => !still && !entry.still;

function drawStill(entry) {
  entry.render(STILL_T, { still: true, light: lightMode() });
}

function loop(time) {
  rafId = 0;
  if (typeof document !== 'undefined' && document.hidden) return;
  const still = frameFxStill();
  let running = 0;
  const due = time - lastDraw >= MIN_FRAME_MS;
  if (due) lastDraw = time;
  const light = due && lightMode();
  for (const entry of entries) {
    if (!animated(entry, still)) continue;
    running += 1;
    if (due && entry.visible) entry.render((time - startedAt) / 1000, { light });
  }
  if (running) rafId = requestAnimationFrame(loop);
}

function kick() {
  if (rafId || typeof requestAnimationFrame !== 'function') return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const still = frameFxStill();
  for (const entry of entries) {
    if (animated(entry, still)) {
      rafId = requestAnimationFrame(loop);
      return;
    }
  }
}

// The viewer's settings changed (簡化特效, theme) or the tab came back: still pictures are redrawn, the loop starts again if needed
function refresh() {
  const still = frameFxStill();
  for (const entry of entries) if (!animated(entry, still)) drawStill(entry);
  kick();
}

function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  startedAt = now();
  document.addEventListener('visibilitychange', refresh);
  if (typeof MutationObserver === 'function') {
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-fx', 'data-mode'] });
  }
  if (typeof IntersectionObserver === 'function') {
    visibility = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = [...entries].find((e) => e.canvas === record.target);
        if (entry) entry.visible = record.isIntersecting;
      }
    }, { rootMargin: '40px' });
  }
}

/**
 * Draw a frame on a canvas and keep it animated through the shared loop.
 * Sizes the canvas (size × FRAME_CANVAS_SCALE CSS px, device pixel ratio up
 * to 2). Where there is no 2D canvas (jsdom, a blocked canvas) or for an
 * unknown frame nothing is drawn and null comes back.
 *
 * @param {HTMLCanvasElement} canvas The canvas over the avatar.
 * @param {string} kind Frame id.
 * @param {number} size Avatar diameter in CSS px.
 * @param {{still?: boolean}} [options] `still`: one static picture, never
 *   animated (a locked frame's preview).
 * @return {?{destroy: function(): void}}
 */
export function mountFrame(canvas, kind, size, { still = false } = {}) {
  if (!canvas || !hasFrameFx(kind) || !(size > 0)) return null;
  // No 2D canvas in this environment at all: don't even ask for a context
  if (typeof CanvasRenderingContext2D === 'undefined') return null;
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const box = size * FRAME_CANVAS_SCALE;
  let ctx = null;
  try {
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);
    ctx = canvas.getContext('2d');
  } catch { /* no canvas here */ }
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const entry = { canvas, still, visible: true, render: createFrameRenderer(ctx, kind, size) };
  watch();
  entries.add(entry);
  visibility?.observe(canvas);
  // Always one picture right away (a still one stays as it is)
  drawStill(entry);
  kick();
  return {
    destroy() {
      entries.delete(entry);
      visibility?.unobserve(canvas);
      if (!entries.size && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
  };
}

/** How many frames are mounted (tests). */
export function mountedFrameCount() {
  return entries.size;
}
