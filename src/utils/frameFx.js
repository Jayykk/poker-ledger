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
    k.glow(c, c, R * 1.35, '196,127,69', 0.14);
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 3.6 * u, k.conic(0.6, ['#5c3311', '#e0a060', '#8a5226', '#f3c08a', '#6b3d16', '#d9935a', '#5c3311']), '#c47f45', 6 * u);
    k.ring(R + 2.6 * u, 0.8 * u, 'rgba(243,192,138,.5)');
    k.shine(t, 1.1, 3.6 * u, '255,214,170');
    k.hole();
  },

  silver(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.45, '203,213,225', 0.16 + 0.04 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 3.6 * u, k.conic(t * 1.2, ['#64748b', '#ffffff', '#94a3b8', '#f1f5f9', '#475569', '#e2e8f0', '#64748b']), '#e2e8f0', 9 * u);
    ctx.save(); ctx.setLineDash([2 * u, 5 * u]); ctx.lineDashOffset = -t * 10 * u; k.ring(R + 6 * u, 1.2 * u, 'rgba(226,232,240,.7)'); ctx.restore();
    k.shine(t, 2, 3.6 * u, '226,240,255');
    k.hole();
    for (const s of k.fixed(4, () => ({ a: rnd(TAU), r: rnd(0, 10) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 7 * u, t + s.ph, '#ffffff', Math.max(0, Math.sin(t * 2 + s.ph)));
    }
  },

  // The tier frame 金框: rays, a laurel
  gold(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(12, t * 0.3, 30 * u, '255,215,0', 0.24);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.55, '255,200,40', 0.2 + 0.07 * Math.sin(t * 3));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 1.8, ['#8a6508', '#fff7c2', '#ffd700', '#a67400', '#fffbe6', '#e0a800', '#8a6508']), '#ffb300', 12 * u);
    ctx.save(); ctx.setLineDash([3 * u, 4 * u]); ctx.lineDashOffset = t * 14 * u; k.ring(R + 6.5 * u, 1.6 * u, '#ffd700', '#ffb300', 4 * u); ctx.restore();
    k.shine(t, 2.6, 4 * u, '255,240,170');
    k.hole();
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + side * (0.25 + i * 0.26);
        const x = c + Math.cos(a) * (R + 9 * u);
        const y = c + Math.sin(a) * (R + 9 * u);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + side * 0.9); ctx.fillStyle = i % 2 ? '#ffe066' : '#d4a017'; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 3 * u;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.5 * u, 2.2 * u, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(0, 18) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t + s.ph, '#fff7c2', Math.max(0, Math.sin(t * 2.4 + s.ph)));
    }
  },

  platinum(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(16, -t * 0.3, 36 * u, '125,211,252', 0.26);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.65, '56,189,248', 0.2 + 0.07 * Math.sin(t * 2.6));
    k.ring(R + 8 * u, 1.4 * u, 'rgba(186,230,253,.8)', '#7dd3fc', 8 * u);
    k.ring(R, 3.8 * u, k.conic(-t * 2.2, ['#e2e8f0', '#7dd3fc', '#ffffff', '#38bdf8', '#f1f5f9', '#0ea5e9', '#e2e8f0']), '#7dd3fc', 14 * u);
    // two lights chasing each other round the outer ring
    for (let n = 0; n < 2; n++) {
      for (let j = 0; j < 16; j++) {
        const a = t * 2.4 + n * Math.PI - j * 0.06;
        const q = 1 - j / 16;
        k.glow(c + Math.cos(a) * (R + 8 * u), c + Math.sin(a) * (R + 8 * u), (1.5 + 4 * q) * u, '224,242,254', 0.85 * q);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    k.shine(t, 3, 3.8 * u, '186,230,253');
    k.hole();
    // wings
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const a = (side < 0 ? Math.PI : 0) + side * (-0.55 + i * 0.3);
        const flap = Math.sin(t * 2.4) * 0.12 * side;
        const x = c + Math.cos(a) * (R + 6 * u);
        const y = c + Math.sin(a) * (R + 6 * u);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a - side * 0.5 + flap); ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 5 * u;
        const g = ctx.createLinearGradient(0, 0, 20 * u, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(125,211,252,.25)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse((9 - i) * u, 0, (13 - i * 2) * u, 2.6 * u, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(4, 24) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t + s.ph, '#e0f2fe', Math.max(0, Math.sin(t * 2.6 + s.ph)));
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
    ctx.save(); ctx.setLineDash([2 * u, 6 * u]); ctx.lineDashOffset = -t * 20 * u; k.ring(R + 7 * u, 2 * u, k.conic(-t * 2, ['#f0abfc', '#67e8f9', '#fde68a', '#a78bfa', '#f0abfc'])); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    k.shine(t, 3.4, 4 * u);
    k.hole();
    // small gems orbiting
    for (let i = 0; i < 5; i++) {
      const a = -t * 1.1 + (i * TAU) / 5;
      const x = c + Math.cos(a) * (R + 15 * u);
      const y = c + Math.sin(a) * (R + 15 * u);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillStyle = `hsl(${(hue + i * 72) % 360},95%,78%)`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8 * u;
      ctx.beginPath(); ctx.moveTo(0, -5.5 * u); ctx.lineTo(3.4 * u, 0); ctx.lineTo(0, 5.5 * u); ctx.lineTo(-3.4 * u, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // the cut gem on top
    const gy = c - D / 2 - 9 * u + Math.sin(t * 2.4) * 1.4 * u;
    ctx.save(); ctx.translate(c, gy); ctx.shadowColor = '#e9d5ff'; ctx.shadowBlur = 14 * u;
    const gg = ctx.createLinearGradient(-9 * u, -8 * u, 9 * u, 10 * u); gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.45, '#a5f3fc'); gg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = gg; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9 * u; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-9 * u, -3 * u); ctx.lineTo(-5 * u, -8 * u); ctx.lineTo(5 * u, -8 * u); ctx.lineTo(9 * u, -3 * u); ctx.lineTo(0, 9 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9 * u, -3 * u); ctx.lineTo(9 * u, -3 * u); ctx.moveTo(-3 * u, -3 * u); ctx.lineTo(0, 9 * u); ctx.lineTo(3 * u, -3 * u); ctx.stroke(); ctx.restore();
    for (const s of k.fixed(10, () => ({ a: rnd(TAU), r: rnd(2, 30) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 9 * u, t * 1.4 + s.ph, '#ffffff', Math.max(0, Math.sin(t * 3 + s.ph)));
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
      const a = -t * 0.6 + (i * TAU) / 24;
      const x = c + Math.cos(a) * (R + 7.5 * u);
      const y = c + Math.sin(a) * (R + 7.5 * u);
      ctx.fillStyle = i % 3 === 0 ? '#fff6c8' : '#c9940a'; ctx.beginPath(); ctx.arc(x, y, (i % 3 === 0 ? 2.1 : 1.3) * u, 0, TAU); ctx.fill();
    }
    k.ring(R + 7.5 * u, 0.8 * u, 'rgba(255,215,0,.45)');
    k.ring(R, 4.2 * u, k.conic(t * 1.6, ['#8a6508', '#fff7c2', '#ffd700', '#a67400', '#fffbe6', '#e0a800', '#8a6508']), '#ffb300', 12 * u);
    k.shine(t, 2.6, 4.2 * u, '255,240,170');
    k.hole();
    // coins orbiting, flipping in 3D
    for (let i = 0; i < 3; i++) {
      const a = t * 1.3 + (i * TAU) / 3;
      const x = c + Math.cos(a) * (R + 17 * u);
      const y = c + Math.sin(a) * (R + 17 * u);
      const w = Math.cos(t * 6 + i * 2);
      const rx = Math.max(0.8, Math.abs(w) * 7.5) * u;
      const ry = 7.5 * u;
      const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
      g.addColorStop(0, '#fffbe6'); g.addColorStop(0.5, w > 0 ? '#ffd700' : '#e0a800'); g.addColorStop(1, '#8a6508');
      ctx.save(); ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 8 * u; ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.8 * u; ctx.strokeStyle = '#7a5a06'; ctx.stroke(); ctx.restore();
    }
    for (const s of k.fixed(7, () => ({ a: rnd(TAU), r: rnd(-4, 22) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t + s.ph, '#fff7c2', Math.max(0, Math.sin(t * 2.4 + s.ph)));
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
    k.ring(R + 8 * u, 2 * u, '#facc15', '#f59e0b', 6 * u); ctx.restore();
    ctx.save(); ctx.setLineDash([1.2 * u, 7 * u]); ctx.lineDashOffset = -t * 16 * u;
    k.ring(R + 13 * u, 1.6 * u, '#e9d5ff'); ctx.restore();
    k.ring(R, 4.2 * u, k.conic(t * 2, ['#4c1d95', '#fde68a', '#a855f7', '#fff7cc', '#7c3aed', '#facc15', '#4c1d95']), '#c084fc', 14 * u);
    k.shine(t, 3, 4.2 * u, '253,230,138');
    k.hole();
    // jewelled crown on top, floating
    const cy = c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.6 * u;
    const w = 25 * u;
    const h = 22 * u;
    ctx.save(); ctx.translate(c, cy); ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 12 * u;
    const g = ctx.createLinearGradient(0, -h, 0, 4 * u); g.addColorStop(0, '#fff7cc'); g.addColorStop(0.5, '#facc15'); g.addColorStop(1, '#b45309');
    ctx.fillStyle = g; ctx.strokeStyle = '#fff7cc'; ctx.lineWidth = 1 * u; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-w, 4 * u); ctx.lineTo(-w - 2 * u, -h * 0.55); ctx.lineTo(-w * 0.45, -h * 0.15); ctx.lineTo(0, -h);
    ctx.lineTo(w * 0.45, -h * 0.15); ctx.lineTo(w + 2 * u, -h * 0.55); ctx.lineTo(w, 4 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 6 * u;
    for (const [x, y, r, col] of [[0, -3 * u, 3.6 * u, '#a855f7'], [-w * 0.6, -1 * u, 2.3 * u, '#f0abfc'], [w * 0.6, -1 * u, 2.3 * u, '#f0abfc'], [0, -h, 2.6 * u, '#fef3c7']]) {
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    for (const s of k.fixed(9, () => ({ a: rnd(TAU), r: rnd(4, 30) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 9 * u, t * 1.2 + s.ph, '#fde68a', Math.max(0, Math.sin(t * 2.8 + s.ph)));
    }
  },

  night(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '79,70,229', 0.26 + 0.07 * Math.sin(t * 1.6));
    k.glow(c + 14 * u, c - 10 * u, R * 1.2, '168,85,247', 0.13);
    const stars = k.fixed(46, () => ({ a: rnd(TAU), r: rnd(3, 30) * u, ph: rnd(TAU), z: rnd(0.6, 1.9) }));
    for (const s of stars) {
      const a = s.a + t * 0.12;
      const al = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + s.ph));
      ctx.fillStyle = `rgba(224,231,255,${al})`; ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + s.r), c + Math.sin(a) * (R + s.r), s.z * u, 0, TAU); ctx.fill();
    }
    k.ring(R, 3.2 * u, k.conic(t * 0.8, ['#0b1026', '#818cf8', '#e0e7ff', '#312e81', '#0b1026', '#c7d2fe', '#0b1026']), '#818cf8', 14 * u);
    // comet with a tail
    if (!k.still) {
      const ca = t * 1.7;
      for (let j = 0; j < 22; j++) {
        const a = ca - j * 0.045;
        const q = 1 - j / 22;
        k.glow(c + Math.cos(a) * (R + 13 * u), c + Math.sin(a) * (R + 13 * u), (1.5 + 4.5 * q) * u, j < 2 ? '255,255,255' : '199,210,254', 0.8 * q);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
    // crescent moon
    const mr = Math.max(11 * u, 4.6); // never a speck, even on a 28px avatar
    const mx = c + Math.cos(-0.85) * (R + Math.max(9 * u, mr * 0.8));
    const my = c + Math.sin(-0.85) * (R + Math.max(9 * u, mr * 0.8));
    ctx.save(); ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 14 * u; ctx.fillStyle = '#fef9c3';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.arc(mx + mr * 0.5, my - mr * 0.22, mr * 0.84, 0, TAU, true); ctx.fill('evenodd');
    ctx.restore();
    for (const s of stars.slice(0, 5)) {
      k.star4(c + Math.cos(s.a - t * 0.2) * (R + s.r), c + Math.sin(s.a - t * 0.2) * (R + s.r), 7 * u, t + s.ph, '#e0e7ff', Math.max(0, Math.sin(t * 1.7 + s.ph)));
    }
  },

  frost(k, t) {
    const { ctx, c, u, R, S } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '125,211,252', 0.2 + 0.06 * Math.sin(t * 2));
    // ice crystals growing out of the ring
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16 + t * 0.12;
      const len = (i % 2 ? 13 : 24) * u + Math.sin(t * 2 + i) * 3 * u;
      const hw = (i % 2 ? 2.6 : 3.8) * u;
      const bx = c + Math.cos(a) * (R + 1 * u);
      const by = c + Math.sin(a) * (R + 1 * u);
      const tx = c + Math.cos(a) * (R + len);
      const ty = c + Math.sin(a) * (R + len);
      const nx = -Math.sin(a) * hw;
      const ny = Math.cos(a) * hw;
      const g = ctx.createLinearGradient(bx, by, tx, ty); g.addColorStop(0, 'rgba(240,249,255,.95)'); g.addColorStop(0.6, 'rgba(125,211,252,.75)'); g.addColorStop(1, 'rgba(56,189,248,.05)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx + nx, by + ny); ctx.lineTo(tx, ty); ctx.lineTo(bx - nx, by - ny); ctx.closePath(); ctx.fill();
      if (!(i % 2)) k.star4(tx, ty, 5 * u, t + i, '#ffffff', Math.max(0, Math.sin(t * 3 + i * 1.7)));
    }
    k.ring(R, 3.2 * u, k.conic(-t * 0.9, ['#e0f2fe', '#38bdf8', '#f0f9ff', '#0ea5e9', '#bae6fd', '#ffffff', '#e0f2fe']), '#7dd3fc', 14 * u);
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
    if (k.still) return;
    // snow drifting down in front
    if (S.parts.length < 26 && Math.random() < 0.5) S.parts.push({ x: c + rnd(-1, 1) * R * 1.7, y: c - R * 1.9, vy: rnd(0.35, 0.9) * u, ph: rnd(TAU), z: rnd(1, 2.4) });
    S.parts = S.parts.filter((p) => p.y < c + R * 1.9);
    for (const p of S.parts) {
      p.y += p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.35 * u;
      ctx.fillStyle = 'rgba(240,249,255,.9)'; ctx.shadowColor = '#bae6fd'; ctx.shadowBlur = 4 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.z * u, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
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
    k.glow(c, c, R * 1.7, '14,165,233', 0.22 + 0.06 * Math.sin(t * 2));
    for (let i = 0; i < 3; i++) { // rolling wave rings
      ctx.save(); ctx.lineWidth = (2.6 - i * 0.6) * u; ctx.strokeStyle = `rgba(${i ? '103,232,249' : '224,242,254'},${0.85 - i * 0.24})`; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8 * u;
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.05; a += 0.04) {
        const r = R + (5 + i * 5.5) * u + Math.sin(a * (6 + i * 2) + t * (2.6 - i * 0.6) * (i % 2 ? -1 : 1)) * (2.6 + i) * u;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
    k.ring(R, 3.4 * u, k.conic(t * 1.4, ['#0c4a6e', '#22d3ee', '#e0f2fe', '#0284c7', '#67e8f9', '#0369a1', '#0c4a6e']), '#22d3ee', 14 * u);
    ctx.globalCompositeOperation = 'source-over';
    k.hole();
    if (k.still) return;
    // spray: droplets thrown up, falling back
    if (Math.random() < 0.5) {
      const a = rnd(-TAU / 2, 0);
      S.parts.push({ x: c + Math.cos(a) * (R + 8 * u), y: c + Math.sin(a) * (R + 8 * u), vx: Math.cos(a) * rnd(0.3, 1.1) * u, vy: -rnd(0.8, 2.2) * u, life: 1, z: rnd(1, 2.6) });
    }
    S.parts = S.parts.filter((p) => p.life > 0);
    for (const p of S.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.07 * u; p.life -= 0.02;
      ctx.fillStyle = `rgba(207,250,254,${p.life})`; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.z * u, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    }
  },

  // ── 主題框, the rest of the families (one each) ──────────────────────

  // 累積給出: petals drifting down
  petal(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '244,114,182', stops: ['#831843', '#fbcfe8', '#ec4899', '#fff1f2', '#be185d', '#f9a8d4', '#831843'], shine: '252,231,243', speed: 1.1 });
    k.ring(R + 6.5 * u, 1 * u, 'rgba(251,207,232,.7)');
    k.hole();
    const petal = (x, y, rot, s, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = '#fbcfe8'; ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 4 * u;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
    };
    // a wreath of petals on the ring
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10 + t * 0.25;
      petal(c + Math.cos(a) * (R + 8 * u), c + Math.sin(a) * (R + 8 * u), a + 0.9, Math.max(5 * u, 2), 0.9);
    }
    for (const p of k.parts(12, 0.14, () => ({ x: c + rnd(-1, 1) * R * 1.7, y: c - R * 1.8, vy: rnd(0.5, 1) * u, ph: rnd(TAU), life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 1.6 + p.ph) * 0.6 * u; p.life -= 0.006;
      if (k.off(p.x, p.y)) petal(p.x, p.y, t * 2 + p.ph, Math.max(4.5 * u, 1.8), Math.min(1, p.life * 3));
    }
  },

  // 單場大贏: fireworks
  firework(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(12, t * 0.3, 36 * u, '250,204,21', 0.2);
    k.base(t, { glow: '217,70,239', stops: ['#4a044e', '#f5d0fe', '#d946ef', '#fef08a', '#a21caf', '#facc15', '#4a044e'], shine: '250,232,255', speed: 2.2 });
    k.hole();
    // three bursts taking turns round the ring: sparks flying out, slowing,
    // sinking a little and going out
    const hues = ['#fde047', '#f472b6', '#67e8f9'];
    for (let b = 0; b < 3; b++) {
      const phase = t * 0.6 + b / 3;
      const q = k.still ? 0.45 : (phase % 1);
      const a0 = b * 2.1 + Math.floor(phase) * 1.7;
      const bx = c + Math.cos(a0) * (R + 15 * u);
      const by = c + Math.sin(a0) * (R + 15 * u);
      const out = 1 - (1 - q) * (1 - q); // fast at first
      const alpha = Math.min(1, q * 8) * (1 - q * q);
      if (alpha <= 0) continue;
      ctx.save(); ctx.shadowColor = hues[b]; ctx.shadowBlur = 6 * u;
      for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 8 : 12;
        for (let n2 = 0; n2 < n; n2++) {
          const a = (n2 * TAU) / n + ring * 0.3;
          // head and two dimmer dots behind it: the spark's streak
          for (let tail = 0; tail < 3; tail++) {
            const r = out * (ring ? 10 : 18) * u * (1 - tail * 0.16);
            ctx.globalAlpha = alpha * (1 - tail * 0.35);
            ctx.fillStyle = ring || tail ? hues[b] : '#ffffff';
            ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r + q * q * 5 * u, Math.max((1.9 - tail * 0.45) * u, 0.75), 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  },

  // 單場大給: a meteor shower
  meteor(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '99,102,241', stops: ['#1e1b4b', '#c7d2fe', '#6366f1', '#fde68a', '#312e81', '#a5b4fc', '#1e1b4b'], shine: '224,231,255', speed: 1.4 });
    ctx.save(); ctx.setLineDash([1 * u, 5 * u]); k.ring(R + 8 * u, 1.3 * u, 'rgba(199,210,254,.75)'); ctx.restore();
    k.hole();
    const streak = (x, y, len, a) => {
      if (!k.off(x, y)) return;
      const g = ctx.createLinearGradient(x, y, x + len, y - len);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(165,180,252,0)');
      ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.6 * u, 0.8); ctx.lineCap = 'round'; ctx.shadowColor = '#a5b4fc'; ctx.shadowBlur = 6 * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len); ctx.stroke(); ctx.restore();
      k.glow(x, y, Math.max(3 * u, 1.2), '255,255,255', a);
    };
    if (k.still) {
      streak(c - R - 6 * u, c - 4 * u, 14 * u, 0.9); streak(c + R * 0.4, c + R + 8 * u, 12 * u, 0.8); streak(c - R * 0.2, c - R - 12 * u, 10 * u, 0.7);
    }
    for (const p of k.parts(7, 0.09, () => ({ x: c + rnd(-0.6, 2) * R, y: c - R * 1.9, v: rnd(1.3, 2.2) * u, len: rnd(10, 18) * u, life: 1 }))) {
      p.x -= p.v; p.y += p.v; p.life -= 0.012;
      streak(p.x, p.y, p.len, Math.min(1, p.life * 2.5));
    }
  },

  // 穩定型: still water
  zen(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '45,212,191', 0.18 + 0.04 * Math.sin(t * 1.2));
    // slow ripples
    for (let i = 0; i < 3; i++) {
      const q = k.still ? 0.2 + i * 0.3 : ((t * 0.22 + i / 3) % 1);
      k.ring(R + (3 + q * 22) * u, 1.2 * u, `rgba(153,246,228,${(0.6 * (1 - q)).toFixed(3)})`);
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 3.8 * u, k.conic(t * 0.5, ['#042f2e', '#99f6e4', '#0d9488', '#f0fdfa', '#115e59', '#5eead4', '#042f2e']), '#2dd4bf', 12 * u);
    k.shine(t, 1.2, 3.8 * u, '204,251,241');
    k.hole();
    // two drops circling each other, light and dark
    for (let i = 0; i < 2; i++) {
      const a = t * 0.6 + i * Math.PI;
      const x = c + Math.cos(a) * (R + 9 * u);
      const y = c + Math.sin(a) * (R + 9 * u);
      ctx.save(); ctx.fillStyle = i ? '#0f766e' : '#f0fdfa'; ctx.strokeStyle = i ? '#99f6e4' : '#0f766e'; ctx.lineWidth = 0.8 * u; ctx.shadowColor = '#5eead4'; ctx.shadowBlur = 7 * u;
      ctx.beginPath(); ctx.arc(x, y, Math.max(3.6 * u, 1.5), 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      for (let j = 1; j < 9; j++) k.glow(c + Math.cos(a - j * 0.07) * (R + 9 * u), c + Math.sin(a - j * 0.07) * (R + 9 * u), (3.2 - j * 0.3) * u, i ? '20,184,166' : '204,251,241', 0.4 * (1 - j / 9));
    }
  },

  // 人氣目標: will-o'-the-wisps
  ghost(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '34,211,238', stops: ['#0f172a', '#e2e8f0', '#475569', '#a5f3fc', '#1e293b', '#67e8f9', '#0f172a'], shine: '236,254,255', speed: 0.9 });
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    // a cold mist breathing round the ring
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10 + t * 0.25;
      k.glow(c + Math.cos(a) * (R + 9 * u), c + Math.sin(a) * (R + 9 * u), (9 + 3 * Math.sin(t * 1.4 + i)) * u, '103,232,249', 0.1);
    }
    // wisps chasing round, both ways
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 ? -1 : 1;
      const a = t * (0.9 + i * 0.17) * dir + i * 1.3;
      const rr = R + (10 + 5 * Math.sin(t * 1.7 + i)) * u;
      for (let j = 0; j < 16; j++) {
        const q = 1 - j / 16;
        const aj = a - j * 0.075 * dir;
        const wob = Math.sin(t * 5 + j * 0.6 + i) * 1.4 * u * (1 - q);
        k.glow(c + Math.cos(aj) * (rr + wob), c + Math.sin(aj) * (rr + wob), Math.max((1.6 + 6 * q) * u, 0.8), i % 2 ? '165,243,252' : '241,245,249', 0.8 * q * q);
      }
      k.glow(c + Math.cos(a) * rr, c + Math.sin(a) * rr, Math.max(4 * u, 1.6), '255,255,255', 0.95);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 神秘大獎: question marks and treasure light
  mystery(k, t) {
    const { c, u, R } = k;
    k.rays(8, t * 0.4, 44 * u, '192,132,252', 0.26, 0.34);
    k.rays(8, -t * 0.3, 30 * u, '250,204,21', 0.24, 0.3);
    k.base(t, { glow: '147,51,234', stops: ['#3b0764', '#e9d5ff', '#9333ea', '#fde68a', '#581c87', '#facc15', '#3b0764'], shine: '243,232,255', speed: 2 });
    k.hole();
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + (i * TAU) / 4;
      const bob = Math.sin(t * 2.4 + i * 1.3);
      k.glyph(i % 2 ? '?' : '★', c + Math.cos(a) * (R + 12 * u), c + Math.sin(a) * (R + 12 * u) + bob * 1.5 * u, Math.max(13 * u, 6), i % 2 ? '#fde68a' : '#e9d5ff', 0, 0.7 + 0.3 * bob);
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(4, 26) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 7 * u, t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.8 + s.ph)));
    }
  },

  // 復仇者: crossing blades of light
  blade(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(10, t * 0.6, 34 * u, '244,63,94', 0.22, 0.28);
    k.base(t, { glow: '225,29,72', stops: ['#1c1917', '#fecdd3', '#be123c', '#e7e5e4', '#44403c', '#fb7185', '#1c1917'], shine: '255,228,230', speed: 2.6 });
    k.hole();
    // slashes flashing across the edge, one after another, leaving an afterglow
    for (let i = 0; i < 4; i++) {
      const phase = t * 1.1 + i / 4;
      const q = k.still ? 0.3 : (phase % 1);
      const seat = i * 1.7 + Math.floor(phase) * 2.4;
      const a = Math.max(0, 1 - Math.abs(q - 0.25) * 2.4);
      if (a <= 0) continue;
      const mx = c + Math.cos(seat) * (R + 7 * u);
      const my = c + Math.sin(seat) * (R + 7 * u);
      const dx = -Math.sin(seat + 0.45) * 22 * u;
      const dy = Math.cos(seat + 0.45) * 22 * u;
      const g = ctx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 12 * u;
      ctx.strokeStyle = `rgba(244,63,94,${(a * 0.7).toFixed(3)})`; ctx.lineWidth = Math.max(5.5 * u, 2.2);
      ctx.beginPath(); ctx.moveTo(mx - dx, my - dy); ctx.lineTo(mx + dx, my + dy); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(2.2 * u, 1);
      ctx.beginPath(); ctx.moveTo(mx - dx, my - dy); ctx.lineTo(mx + dx, my + dy); ctx.stroke(); ctx.restore();
    }
    // two crossed swords under the face
    const sw = Math.max(1 * u, 0.42);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(c, c + R + 9 * u); ctx.rotate(side * 0.8); ctx.scale(sw, sw);
      ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 8;
      const g = ctx.createLinearGradient(-2, 0, 2, 0); g.addColorStop(0, '#94a3b8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(2.2, -19); ctx.lineTo(2.2, 2); ctx.lineTo(-2.2, 2); ctx.lineTo(-2.2, -19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(-6, 2, 12, 2.4);
      ctx.fillStyle = '#9f1239'; ctx.fillRect(-1.5, 4.4, 3, 6); ctx.restore();
    }
    k.star4(c, c + R + 9 * u, Math.max(6 * u, 2.5), t * 2, '#ffffff', 0.5 + 0.5 * Math.sin(t * 4));
  },

  // 錢圈常客: a laurel wreath and a medal
  laurel(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(12, t * 0.2, 34 * u, '134,239,172', 0.2);
    k.base(t, { glow: '34,197,94', stops: ['#14532d', '#bbf7d0', '#16a34a', '#fef9c3', '#166534', '#86efac', '#14532d'], shine: '220,252,231', speed: 1.5 });
    k.hole();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 + side * (0.3 + i * 0.3);
        const sway = Math.sin(t * 1.8 + i * 0.6) * 0.12;
        ctx.save(); ctx.translate(c + Math.cos(a) * (R + 8 * u), c + Math.sin(a) * (R + 8 * u)); ctx.rotate(a + side * (0.95 + sway));
        ctx.fillStyle = i % 2 ? '#86efac' : '#22c55e'; ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 3 * u;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(6 * u, 2.2), Math.max(2.4 * u, 0.9), 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    // medal at the foot of the wreath
    const my = c + R + 9 * u;
    ctx.save(); ctx.shadowColor = '#facc15'; ctx.shadowBlur = 8 * u; ctx.fillStyle = '#fde047'; ctx.strokeStyle = '#a16207'; ctx.lineWidth = 0.8 * u;
    ctx.beginPath(); ctx.arc(c, my, Math.max(5.5 * u, 2.2), 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    k.star4(c, my, 5 * u, t, '#fffbeb', 0.6 + 0.4 * Math.sin(t * 3));
  },

  // 不死鳥: wings of fire
  firebird(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '249,115,22', 0.24 + 0.08 * Math.sin(t * 3));
    // wing feathers fanning out on both sides, beating
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const beat = Math.sin(t * 2.6) * 0.16;
        const a = (side < 0 ? Math.PI : 0) + side * (-0.95 + i * 0.3 + beat);
        const len = (26 - Math.abs(i - 2.5) * 4) * u;
        ctx.save(); ctx.translate(c + Math.cos(a) * R, c + Math.sin(a) * R); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(254,240,138,.95)'); g.addColorStop(0.5, 'rgba(249,115,22,.75)'); g.addColorStop(1, 'rgba(220,38,38,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, Math.max(3 * u, 1.2), 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 2, ['#7c2d12', '#fef08a', '#f97316', '#fff7ed', '#b91c1c', '#fbbf24', '#7c2d12']), '#fb923c', 16 * u);
    k.shine(t, 3, 4 * u, '255,237,213');
    k.hole();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of k.parts(18, 0.3, () => ({ x: c + rnd(-1, 1) * R * 1.3, y: c + R * 1.2, vy: rnd(0.6, 1.3) * u, ph: rnd(TAU), life: 1 }))) {
      p.y -= p.vy; p.x += Math.sin(t * 3 + p.ph) * 0.4 * u; p.life -= 0.012;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, Math.max(2.6 * u, 1), '253,186,116', p.life);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // 重買王: charging up, segment by segment
  reload(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '6,182,212', stops: ['#083344', '#a5f3fc', '#0891b2', '#ecfeff', '#155e75', '#67e8f9', '#083344'], shine: '207,250,254', speed: 2.4 });
    k.hole();
    // twelve cells filling clockwise, then starting over
    const N = 12;
    const filled = k.still ? 8 : (t * 5) % (N + 3);
    ctx.save(); ctx.lineCap = 'butt';
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + (i * TAU) / N + 0.06;
      const on = i < filled;
      ctx.lineWidth = Math.max(3.4 * u, 1.3); ctx.strokeStyle = on ? '#67e8f9' : 'rgba(103,232,249,.22)';
      ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = on ? 7 * u : 0;
      ctx.beginPath(); ctx.arc(c, c, R + 8 * u, a0, a0 + TAU / N - 0.12); ctx.stroke();
    }
    ctx.restore();
    // two arrows chasing round: again, and again
    for (let i = 0; i < 2; i++) {
      const a = t * 2 + i * Math.PI;
      ctx.save(); ctx.translate(c + Math.cos(a) * (R + 15 * u), c + Math.sin(a) * (R + 15 * u)); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#ecfeff'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 6 * u;
      const s = Math.max(4.2 * u, 1.7);
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  },

  // 亞軍: silver wings
  silverwing(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(14, -t * 0.25, 36 * u, '226,232,240', 0.2);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '148,163,184', 0.2 + 0.05 * Math.sin(t * 2));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R + 6.5 * u, 1.2 * u, 'rgba(241,245,249,.8)', '#e2e8f0', 6 * u);
    k.ring(R, 4 * u, k.conic(t * 1.5, ['#334155', '#ffffff', '#94a3b8', '#f8fafc', '#475569', '#e2e8f0', '#334155']), '#e2e8f0', 13 * u);
    k.shine(t, 2.4, 4 * u, '241,245,249');
    k.hole();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const flap = Math.sin(t * 2.2) * 0.14 * side;
        const a = (side < 0 ? Math.PI : 0) + side * (-0.7 + i * 0.3);
        ctx.save(); ctx.translate(c + Math.cos(a) * (R + 5 * u), c + Math.sin(a) * (R + 5 * u)); ctx.rotate(a - side * 0.55 + flap);
        ctx.shadowColor = '#e2e8f0'; ctx.shadowBlur = 5 * u;
        const len = (21 - i * 2.6) * u;
        const g = ctx.createLinearGradient(0, 0, len * 1.4, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(148,163,184,.2)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(len * 0.7, 0, len * 0.7, Math.max(2.6 * u, 1), 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    k.glyph('2', c, c + R + 9 * u, Math.max(11 * u, 6), '#f8fafc', 0, 0.95);
  },

  // 泡沫: bubbles
  foam(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '56,189,248', stops: ['#0c4a6e', '#bae6fd', '#38bdf8', '#fbcfe8', '#0369a1', '#a5f3fc', '#0c4a6e'], shine: '224,242,254', speed: 1.3 });
    k.hole();
    const bubble = (x, y, r, a, hue) => {
      if (!k.off(x, y) || a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.9 * u, 0.5);
      ctx.strokeStyle = `hsl(${hue},90%,82%)`; ctx.fillStyle = `hsla(${hue},90%,80%,.16)`; ctx.shadowColor = `hsl(${hue},90%,75%)`; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, TAU); ctx.fill(); ctx.restore();
    };
    for (const b of k.fixed(7, (i) => ({ a: (i * TAU) / 7 + rnd(0.5), r: rnd(8, 16) * u, z: rnd(3.5, 6.5), ph: rnd(TAU) }))) {
      const a = b.a + Math.sin(t * 0.8 + b.ph) * 0.15;
      bubble(c + Math.cos(a) * (R + b.r), c + Math.sin(a) * (R + b.r) + Math.sin(t * 1.6 + b.ph) * 2 * u, Math.max(b.z * u, 1.6), 0.95, 180 + ((t * 30 + b.ph * 40) % 150));
    }
    for (const p of k.parts(10, 0.12, () => ({ x: c + rnd(-1, 1) * R * 1.6, y: c + R * 1.7, vy: rnd(0.5, 1) * u, z: rnd(2.5, 5), ph: rnd(TAU), life: 1 }))) {
      p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.4 * u; p.life -= 0.007;
      bubble(p.x, p.y, Math.max(p.z * u, 1.3), Math.min(1, p.life * 3), 190 + p.ph * 20);
    }
  },

  // 開路先鋒: a gale
  gale(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '163,230,53', stops: ['#1a2e05', '#ecfccb', '#65a30d', '#f7fee7', '#3f6212', '#bef264', '#1a2e05'], shine: '236,252,203', speed: 3.4 });
    k.hole();
    // wind streaks whipping round at different speeds
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = t * (2.2 + (i % 3) * 0.7) + i * 1.05;
      const rr = R + (6 + (i % 3) * 5) * u;
      for (let j = 0; j < 10; j++) {
        const q = 1 - j / 10;
        ctx.strokeStyle = `rgba(236,252,203,${(0.75 * q).toFixed(3)})`; ctx.lineWidth = Math.max((0.6 + 1.8 * q) * u, 0.5);
        ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 4 * u;
        ctx.beginPath(); ctx.arc(c, c, rr, a - j * 0.09 - 0.1, a - j * 0.09); ctx.stroke();
      }
    }
    ctx.restore();
    // leaves caught in it
    for (let i = 0; i < 4; i++) {
      const a = t * 1.9 + (i * TAU) / 4;
      ctx.save(); ctx.translate(c + Math.cos(a) * (R + 14 * u), c + Math.sin(a) * (R + 14 * u)); ctx.rotate(a * 2 + t * 4);
      ctx.fillStyle = '#bef264'; ctx.shadowColor = '#84cc16'; ctx.shadowBlur = 4 * u;
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(4.5 * u, 1.8), Math.max(1.8 * u, 0.8), 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  },

  // 大牌對決: fire against ice
  clash(k, t) {
    const { ctx, c, u, R } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c - R * 0.7, c, R * 1.4, '239,68,68', 0.22 + 0.06 * Math.sin(t * 3));
    k.glow(c + R * 0.7, c, R * 1.4, '56,189,248', 0.22 + 0.06 * Math.cos(t * 3));
    ctx.globalCompositeOperation = 'source-over';
    // the ring: red on the left half, blue on the right
    ctx.save(); ctx.lineWidth = 4.2 * u; ctx.shadowBlur = 14 * u;
    ctx.strokeStyle = k.conic(t * 1.5, ['#7f1d1d', '#fecaca', '#ef4444', '#fff7ed', '#7f1d1d']); ctx.shadowColor = '#ef4444';
    ctx.beginPath(); ctx.arc(c, c, R, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = k.conic(-t * 1.5, ['#0c4a6e', '#e0f2fe', '#38bdf8', '#ffffff', '#0c4a6e']); ctx.shadowColor = '#38bdf8';
    ctx.beginPath(); ctx.arc(c, c, R, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.restore();
    k.shine(t, 2.8, 4.2 * u, '255,255,255');
    k.hole();
    // sparks where the two meet, top and bottom
    for (const dir of [-1, 1]) {
      const x = c;
      const y = c + dir * R;
      const pulse = 0.6 + 0.4 * Math.sin(t * 6 + dir);
      k.glow(x, y, 9 * u * pulse, '255,255,255', 0.5);
      k.star4(x, y, Math.max(15 * u, 5.5) * pulse, t * 2, '#ffffff', 0.95);
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + t * 3 * dir;
        const r = ((t * 22 + i * 7) % 12) * u;
        k.glow(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(2.8 * u, 1.1), i % 2 ? '254,202,202' : '186,230,253', 1 - r / (12 * u));
      }
    }
    // embers on the left, snow on the right
    for (const p of k.parts(14, 0.2, () => {
      const hot = Math.random() < 0.5;
      return { hot, x: c + (hot ? -1 : 1) * rnd(0.5, 1.6) * R, y: c + (hot ? 1 : -1) * R * 1.5, vy: rnd(0.5, 1) * u * (hot ? -1 : 1), ph: rnd(TAU), life: 1 };
    })) {
      p.y += p.vy; p.x += Math.sin(t * 2.5 + p.ph) * 0.3 * u; p.life -= 0.009;
      if (k.off(p.x, p.y)) k.glow(p.x, p.y, Math.max(3.2 * u, 1.3), p.hot ? '253,186,116' : '224,242,254', p.life);
    }
  },

  // 悲劇英雄: a crown of thorns
  thorn(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '159,18,57', stops: ['#1c1917', '#fda4af', '#881337', '#d6d3d1', '#292524', '#be123c', '#1c1917'], shine: '254,205,211', speed: 1.1 });
    k.hole();
    // thorns all round, breathing
    for (let i = 0; i < 18; i++) {
      const a = (i * TAU) / 18 + (i % 2 ? 0.12 : -0.12);
      const len = ((i % 3 ? 9 : 15) + Math.sin(t * 1.6 + i) * 1.4) * u;
      const hw = Math.max(2.8 * u, 1.1);
      const bx = c + Math.cos(a) * (R + 1.5 * u);
      const by = c + Math.sin(a) * (R + 1.5 * u);
      ctx.save(); ctx.fillStyle = i % 3 ? '#78716c' : '#d6d3d1'; ctx.shadowColor = '#e11d48'; ctx.shadowBlur = 6 * u;
      ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * hw, by + Math.cos(a) * hw);
      ctx.lineTo(c + Math.cos(a + 0.18) * (R + len), c + Math.sin(a + 0.18) * (R + len));
      ctx.lineTo(bx + Math.sin(a) * hw, by - Math.cos(a) * hw); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // a rose, and petals falling from it
    const rx = c + Math.cos(-0.8) * (R + 8 * u);
    const ry = c + Math.sin(-0.8) * (R + 8 * u);
    const rs = Math.max(5.5 * u, 2.4);
    ctx.save(); ctx.shadowColor = '#e11d48'; ctx.shadowBlur = 8 * u;
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 + t * 0.3;
      ctx.fillStyle = i % 2 ? '#e11d48' : '#9f1239';
      ctx.beginPath(); ctx.arc(rx + Math.cos(a) * rs * 0.45, ry + Math.sin(a) * rs * 0.45, rs * 0.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#4c0519'; ctx.beginPath(); ctx.arc(rx, ry, rs * 0.3, 0, TAU); ctx.fill(); ctx.restore();
    for (const p of k.parts(6, 0.05, () => ({ x: rx + rnd(-3, 3) * u, y: ry, vy: rnd(0.4, 0.8) * u, ph: rnd(TAU), life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.5 * u; p.life -= 0.008;
      if (!k.off(p.x, p.y)) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 2 + p.ph); ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = '#e11d48';
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(3 * u, 1.3), Math.max(1.6 * u, 0.7), 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  },

  // 四條: the four suits in orbit
  quad(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(4, t * 0.5, 46 * u, '250,204,21', 0.28, 0.22);
    k.rays(4, t * 0.5 + TAU / 8, 30 * u, '248,250,252', 0.2, 0.18);
    k.base(t, { glow: '234,179,8', stops: ['#18181b', '#fef9c3', '#eab308', '#f4f4f5', '#3f3f46', '#fde047', '#18181b'], shine: '254,249,195', speed: 2 });
    ctx.save(); ctx.setLineDash([6 * u, 4 * u]); ctx.lineDashOffset = -t * 12 * u; k.ring(R + 7 * u, 1.5 * u, '#fde047', '#eab308', 5 * u); ctx.restore();
    k.hole();
    const suits = [['♠', '#f4f4f5'], ['♥', '#f87171'], ['♣', '#f4f4f5'], ['♦', '#f87171']];
    for (let i = 0; i < 4; i++) {
      const a = t * 0.9 + (i * TAU) / 4;
      const x = c + Math.cos(a) * (R + 14 * u);
      const y = c + Math.sin(a) * (R + 14 * u);
      const s = Math.max(8.5 * u, 4.2);
      ctx.save(); ctx.fillStyle = '#18181b'; ctx.strokeStyle = '#fde047'; ctx.lineWidth = Math.max(0.9 * u, 0.5); ctx.shadowColor = '#eab308'; ctx.shadowBlur = 7 * u;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      k.glyph(suits[i][0], x, y, s * 1.5, suits[i][1], 0, 1);
    }
  },

  // 同花順: a rainbow, step by step
  rainbow(k, t) {
    const { ctx, c, u, R } = k;
    const hue = (t * 50) % 360;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '129,140,248', 0.2 + 0.06 * Math.sin(t * 2.4));
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4 * u, k.conic(t * 2.4, ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#d946ef', '#ef4444']), '#a5b4fc', 14 * u);
    k.shine(t, 3, 4 * u);
    k.hole();
    // five steps climbing round the ring, each a colour on: a straight, all one suit
    for (let i = 0; i < 5; i++) {
      const a = t * 0.8 + i * 0.5;
      const rr = R + (7 + i * 2.6) * u;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2.6 * u, 1.1);
      ctx.strokeStyle = `hsl(${(hue + i * 55) % 360},95%,68%)`; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 7 * u;
      ctx.beginPath(); ctx.arc(c, c, rr, a, a + 0.42); ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, rr, a + Math.PI, a + Math.PI + 0.42); ctx.stroke(); ctx.restore();
    }
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(6, 26) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 7 * u, t + s.ph, '#ffffff', Math.max(0, Math.sin(t * 2.6 + s.ph)));
    }
  },

  // 皇家同花順: 10 J Q K A, crowned
  royal(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(16, t * 0.3, 50 * u, '250,204,21', 0.3);
    k.rays(8, -t * 0.22, 36 * u, '239,68,68', 0.2, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.9, '220,38,38', 0.2 + 0.08 * Math.sin(t * 2.6));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setLineDash([2 * u, 4 * u]); ctx.lineDashOffset = t * 14 * u; k.ring(R + 7 * u, 1.8 * u, '#fde047', '#f59e0b', 6 * u); ctx.restore();
    k.ring(R, 4.4 * u, k.conic(t * 2, ['#450a0a', '#fef08a', '#dc2626', '#fffbeb', '#7f1d1d', '#facc15', '#450a0a']), '#f59e0b', 16 * u);
    k.shine(t, 3, 4.4 * u, '254,243,199');
    k.hole();
    // the five cards, fanned under the face
    const ranks = ['10', 'J', 'Q', 'K', 'A'];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i - 2) * 0.36;
      const lift = Math.sin(t * 2.4 - i * 0.6) * 1.4 * u;
      const w = Math.max(8 * u, 4.2);
      const h = w * 1.35;
      ctx.save(); ctx.translate(c + Math.cos(a) * (R + 11 * u + lift), c + Math.sin(a) * (R + 11 * u + lift)); ctx.rotate(a - Math.PI / 2);
      ctx.fillStyle = '#fffbeb'; ctx.strokeStyle = '#b45309'; ctx.lineWidth = Math.max(0.6 * u, 0.4); ctx.shadowColor = '#facc15'; ctx.shadowBlur = 6 * u;
      ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowBlur = 0; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.restore();
      k.glyph(ranks[i], c + Math.cos(a) * (R + 11 * u + lift), c + Math.sin(a) * (R + 11 * u + lift), w * (i ? 0.95 : 0.7), '#b91c1c', a - Math.PI / 2, 1);
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.5 * u, 32 * u, ['#fffbeb', '#facc15', '#92400e'], '#ef4444');
  },

  // 常客: the hands of a clock
  clock(k, t) {
    const { ctx, c, u, R } = k;
    k.base(t, { glow: '217,119,6', stops: ['#292524', '#fde68a', '#b45309', '#fffbeb', '#44403c', '#fbbf24', '#292524'], shine: '254,243,199', speed: 1.2 });
    k.ring(R + 12 * u, 1 * u, 'rgba(253,230,138,.45)');
    k.hole();
    // twelve hour marks, the one under the hand lit
    const hand = k.still ? 1.1 : t * 0.9;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 12;
      const near = Math.max(0, Math.cos(hand - Math.PI / 2 - a));
      const long = i % 3 === 0;
      ctx.save(); ctx.strokeStyle = '#fde68a'; ctx.globalAlpha = 0.45 + 0.55 * near ** 6; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max((long ? 2.2 : 1.3) * u, 0.6); ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * (R + 6 * u), c + Math.sin(a) * (R + 6 * u));
      ctx.lineTo(c + Math.cos(a) * (R + (long ? 11 : 9) * u), c + Math.sin(a) * (R + (long ? 11 : 9) * u)); ctx.stroke(); ctx.restore();
    }
    // the hand sweeping outside the face, with a fading trail
    const ha = hand - Math.PI / 2;
    for (let j = 0; j < 14; j++) {
      const a = ha - j * 0.06;
      k.glow(c + Math.cos(a) * (R + 12 * u), c + Math.sin(a) * (R + 12 * u), Math.max((4 - j * 0.24) * u, 0.8), j ? '253,230,138' : '255,255,255', 0.85 * (1 - j / 14));
    }
    // and a slow one going the other way: the long nights
    const ma = -hand * 0.25;
    k.star4(c + Math.cos(ma) * (R + 17 * u), c + Math.sin(ma) * (R + 17 * u), Math.max(6 * u, 2.5), t, '#fffbeb', 0.9);
  },

  // 主辦人: a carnival
  carnival(k, t) {
    const { ctx, c, u, R } = k;
    k.rays(12, t * 0.3, 38 * u, '244,114,182', 0.2);
    k.base(t, { glow: '236,72,153', stops: ['#701a75', '#fbcfe8', '#ec4899', '#fef08a', '#0e7490', '#67e8f9', '#701a75'], shine: '253,242,248', speed: 2.2 });
    k.hole();
    // a string of lights, chasing
    const cols = ['#fde047', '#f472b6', '#67e8f9', '#86efac'];
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16;
      const on = k.still ? 1 : 0.35 + 0.65 * (Math.floor(t * 5 + i) % 2);
      ctx.save(); ctx.globalAlpha = on; ctx.fillStyle = cols[i % 4]; ctx.shadowColor = cols[i % 4]; ctx.shadowBlur = 7 * u;
      ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + 8 * u), c + Math.sin(a) * (R + 8 * u), Math.max(2.3 * u, 1), 0, TAU); ctx.fill(); ctx.restore();
    }
    // confetti
    for (const p of k.parts(18, 0.3, () => ({ x: c + rnd(-1, 1) * R * 1.7, y: c - R * 1.8, vy: rnd(0.6, 1.2) * u, ph: rnd(TAU), col: cols[Math.floor(rnd(4))], life: 1 }))) {
      p.y += p.vy; p.x += Math.sin(t * 3 + p.ph) * 0.5 * u; p.life -= 0.008;
      if (!k.off(p.x, p.y)) continue;
      const w = Math.max(3.6 * u, 1.6);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 5 + p.ph); ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.col;
      ctx.fillRect(-w / 2, -w * 0.25 * Math.abs(Math.cos(t * 6 + p.ph)) - 0.3, w, w * 0.5 * Math.abs(Math.cos(t * 6 + p.ph)) + 0.6); ctx.restore();
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
    k.ring(R + 7 * u, 1.8 * u, '#fde68a', '#f59e0b', 5 * u); ctx.restore();
    k.ring(R, 4.2 * u, k.conic(t * 1.8, ['#064e3b', '#a7f3d0', '#10b981', '#fef3c7', '#047857', '#fde68a', '#064e3b']), '#34d399', 14 * u);
    k.shine(t, 2.8, 4.2 * u, '209,250,229');
    k.hole();
    // notes: spawned under the avatar, drifting up and turning
    if (!k.still) {
      if (S.parts.length < 10 && Math.random() < 0.1) {
        S.parts.push({ x: c + rnd(-1, 1) * R * 1.5, y: c + R * 1.6, vy: rnd(0.75, 1.25) * u, ph: rnd(TAU), sp: rnd(1.5, 3), life: 1 });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
    }
    const notes = k.still
      ? [0, 1, 2, 3, 4].map((i) => ({ x: c + Math.cos(-2.6 + i * 0.5) * (R + 12 * u), y: c + Math.sin(-2.6 + i * 0.5) * (R + 12 * u), ph: i, sp: 0, life: 1 }))
      : S.parts;
    for (const p of notes) {
      if (!k.still) { p.y -= p.vy; p.x += Math.sin(t * 2 + p.ph) * 0.4 * u; p.life -= 0.006; }
      // never across the face
      if (Math.hypot(p.x - c, p.y - c) < D / 2 + 2 * u) continue;
      const flip = k.still ? 0.9 : Math.cos(t * p.sp + p.ph);
      const w = Math.max(15 * u, 6);
      const h = Math.max(w * 0.12, Math.abs(flip) * w * 0.56);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t + p.ph) * 0.5); ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.shadowColor = '#34d399'; ctx.shadowBlur = 5 * u;
      ctx.fillStyle = flip > 0 ? '#a7f3d0' : '#34d399'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowBlur = 0; ctx.strokeStyle = '#065f46'; ctx.lineWidth = 0.7 * u; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#065f46'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.17, Math.min(w * 0.17, h * 0.32), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.4 * u, 30 * u, ['#ecfdf5', '#34d399', '#065f46'], '#fde68a');
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(2, 26) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.5 + s.ph)));
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
    k.ring(R + 6.5 * u, 1.2 * u, 'rgba(254,205,211,.75)', '#fb7185', 6 * u);
    k.ring(R, 4 * u, k.conic(t * 1.4, ['#9f1239', '#fecdd3', '#fb7185', '#fef3c7', '#e11d48', '#fde68a', '#9f1239']), '#fb7185', 14 * u);
    k.shine(t, 2.4, 4 * u, '255,228,230');
    k.hole();
    const heart = (x, y, s, a, col) => {
      if (a <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-6, -2, -3, -6, 0, -3); ctx.bezierCurveTo(3, -6, 6, -2, 0, 3); ctx.fill(); ctx.restore();
    };
    if (k.still) {
      for (let i = 0; i < 5; i++) {
        const a = -2.5 + i * 0.47;
        const r = (9 + (i % 2) * 7) * u;
        heart(c + Math.cos(a) * (R + r), c + Math.sin(a) * (R + r), Math.max(1.8 * u, 0.55), 0.9, i % 2 ? '#fda4af' : '#fb7185');
      }
    } else {
      if (S.parts.length < 10 && Math.random() < 0.13) {
        S.parts.push({ x: c + rnd(-1, 1) * R * 1.5, y: c + R * 1.5, vy: rnd(0.7, 1.2) * u, ph: rnd(TAU), z: rnd(1.3, 2.3), life: 1 });
      }
      S.parts = S.parts.filter((p) => p.life > 0);
      for (const p of S.parts) {
        p.y -= p.vy; p.x += Math.sin(t * 2.4 + p.ph) * 0.35 * u; p.life -= 0.007;
        // never across the face
        if (Math.hypot(p.x - c, p.y - c) < D / 2 + 2 * u) continue;
        heart(p.x, p.y, Math.max(p.z * u, 0.55), Math.min(1, p.life * 2.2), p.z > 1.8 ? '#fb7185' : '#fda4af');
      }
    }
    // halo over the head
    const hy = c - D / 2 - 7 * u + Math.sin(t * 2) * 1.5 * u;
    ctx.save(); ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 10 * u; ctx.strokeStyle = '#fef9c3'; ctx.lineWidth = 2.6 * u;
    ctx.beginPath(); ctx.ellipse(c, hy, 17 * u, 5 * u, 0, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(245,158,11,.7)'; ctx.lineWidth = 0.8 * u;
    ctx.beginPath(); ctx.ellipse(c, hy, 17 * u, 5 * u, 0, 0, TAU); ctx.stroke(); ctx.restore();
    k.star4(c + 17 * u, hy, 6 * u, t * 2, '#fffbeb', 0.5 + 0.5 * Math.sin(t * 3));
  },

  // 本月老闆: shock rings pulsing out, red and gold
  tycoon(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(10, t * 0.5, 46 * u, '248,113,113', 0.26, 0.36);
    k.rays(10, -t * 0.35, 30 * u, '251,191,36', 0.24, 0.3);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.8, '220,38,38', 0.22 + 0.1 * Math.sin(t * 3.4));
    // rings bursting outwards, one after another
    for (let i = 0; i < 3; i++) {
      const q = k.still ? (0.25 + i * 0.3) : ((t * 0.55 + i / 3) % 1);
      k.ring(R + (4 + q * 26) * u, (2.4 - q * 1.8) * u, `rgba(252,165,165,${(0.75 * (1 - q)).toFixed(3)})`, '#ef4444', 8 * u);
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.4 * u, k.conic(-t * 2.4, ['#450a0a', '#fca5a5', '#dc2626', '#fde68a', '#7f1d1d', '#f59e0b', '#450a0a']), '#ef4444', 16 * u);
    k.shine(t, 3.2, 4.4 * u, '254,226,226');
    k.hole();
    // gold studs round the ring, lit in turn
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12 + t * 0.4;
      const on = 0.45 + 0.55 * Math.max(0, Math.sin(t * 4 - i * 0.9));
      ctx.save(); ctx.globalAlpha = on; ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 5 * u;
      ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + 6.5 * u), c + Math.sin(a) * (R + 6.5 * u), 1.7 * u, 0, TAU); ctx.fill(); ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.6) * 1.6 * u, 34 * u, ['#fff7cc', '#f59e0b', '#7f1d1d'], '#ef4444');
    for (const s of k.fixed(7, () => ({ a: rnd(TAU), r: rnd(6, 28) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t * 1.4 + s.ph, '#fecaca', Math.max(0, Math.sin(t * 3 + s.ph)));
    }
  },

  // 本月獵頭王: a scope locking on, crimson
  reticle(k, t) {
    const { ctx, c, u, R, D } = k;
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.7, '244,63,94', 0.2 + 0.08 * Math.sin(t * 3));
    // radar sweep
    if (typeof ctx.createConicGradient === 'function') {
      const sweep = ctx.createConicGradient(t * 2.2, c, c);
      sweep.addColorStop(0, 'rgba(251,113,133,0)'); sweep.addColorStop(0.82, 'rgba(251,113,133,0)'); sweep.addColorStop(1, 'rgba(251,113,133,.5)');
      ctx.fillStyle = sweep; ctx.beginPath(); ctx.arc(c, c, R + 22 * u, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setLineDash([1.4 * u, 4.2 * u]); ctx.lineDashOffset = t * 12 * u;
    k.ring(R + 13 * u, 1.4 * u, 'rgba(254,205,211,.8)'); ctx.restore();
    k.ring(R, 3.8 * u, k.conic(t * 1.6, ['#4c0519', '#fda4af', '#e11d48', '#fff1f2', '#881337', '#fb7185', '#4c0519']), '#f43f5e', 14 * u);
    k.shine(t, 3, 3.8 * u, '255,228,230');
    k.hole();
    // four ticks closing in and backing off, the whole scope turning slowly
    const lock = 0.5 + 0.5 * Math.sin(t * 2.6);
    ctx.save(); ctx.translate(c, c); ctx.rotate(Math.sin(t * 0.7) * 0.5);
    ctx.strokeStyle = '#fff1f2'; ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 8 * u; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      const r0 = R + (5 + lock * 6) * u;
      ctx.lineWidth = 2.6 * u; ctx.beginPath(); ctx.moveTo(r0, 0); ctx.lineTo(r0 + 11 * u, 0); ctx.stroke();
      // corner brackets between the ticks
      ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.arc(0, 0, R + (17 - lock * 4) * u, TAU / 8 - 0.22, TAU / 8 + 0.22); ctx.stroke();
    }
    ctx.restore();
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2.2) * 1.4 * u, 30 * u, ['#fff1f2', '#fb7185', '#881337'], '#fde68a');
  },

  // 本月釘子戶: a sun that never sets, amber
  sunrise(k, t) {
    const { ctx, c, u, R, D } = k;
    k.rays(20, t * 0.35, 46 * u, '251,191,36', 0.3, 0.42);
    k.rays(10, -t * 0.2, 30 * u, '253,224,71', 0.26, 0.55);
    ctx.globalCompositeOperation = 'lighter';
    k.glow(c, c, R * 1.85, '249,115,22', 0.24 + 0.08 * Math.sin(t * 2.2));
    // corona flames licking round the ring
    for (let i = 0; i < 26; i++) {
      const a = (i * TAU) / 26 + t * 0.5;
      const len = (7 + 6 * Math.sin(t * 3.4 + i * 1.9) + 4 * Math.sin(t * 5.1 + i * 0.7)) * u;
      k.glow(c + Math.cos(a) * (R + len * 0.5), c + Math.sin(a) * (R + len * 0.5), Math.max(2 * u, len * 0.75), '253,186,116', 0.34);
    }
    ctx.globalCompositeOperation = 'source-over';
    k.ring(R, 4.2 * u, k.conic(t * 1.3, ['#7c2d12', '#fed7aa', '#f97316', '#fef9c3', '#c2410c', '#fbbf24', '#7c2d12']), '#fb923c', 16 * u);
    k.shine(t, 2.6, 4.2 * u, '255,237,213');
    k.hole();
    // the days of the month: beads lighting one after another
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 16;
      const on = k.still ? (i % 3 ? 0.5 : 1) : 0.3 + 0.7 * Math.max(0, Math.cos(t * 1.6 - (i * TAU) / 16));
      ctx.save(); ctx.globalAlpha = on; ctx.fillStyle = '#fff7ed'; ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 6 * u;
      ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + 9 * u), c + Math.sin(a) * (R + 9 * u), 1.6 * u, 0, TAU); ctx.fill(); ctx.restore();
    }
    k.crown(c - D / 2 - 5 * u + Math.sin(t * 2) * 1.4 * u, 30 * u, ['#fffbeb', '#fbbf24', '#9a3412'], '#fff7ed');
    for (const s of k.fixed(6, () => ({ a: rnd(TAU), r: rnd(8, 28) * u, ph: rnd(TAU) }))) {
      k.star4(c + Math.cos(s.a) * (R + s.r), c + Math.sin(s.a) * (R + s.r), 8 * u, t + s.ph, '#fef3c7', Math.max(0, Math.sin(t * 2.2 + s.ph)));
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
  k.parts = (max, rate, make) => {
    if (k.still) return [];
    if (k.S.parts.length < max && Math.random() < rate) k.S.parts.push(make());
    k.S.parts = k.S.parts.filter((p) => p.life > 0);
    return k.S.parts;
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
    ctx.save(); ctx.translate(c, cy); ctx.shadowColor = body; ctx.shadowBlur = 9 * u;
    const g = ctx.createLinearGradient(0, -h, 0, 2 * u); g.addColorStop(0, light); g.addColorStop(0.55, body); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.strokeStyle = light; ctx.lineWidth = 0.8 * u; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-half, 2 * u); ctx.lineTo(-half - 1.2 * u, -h * 0.6); ctx.lineTo(-half * 0.45, -h * 0.2); ctx.lineTo(0, -h);
    ctx.lineTo(half * 0.45, -h * 0.2); ctx.lineTo(half + 1.2 * u, -h * 0.6); ctx.lineTo(half, 2 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowColor = gem; ctx.shadowBlur = 5 * u; ctx.fillStyle = gem;
    for (const [x, y, r] of [[0, -h, 1.9 * u], [-half - 1.2 * u, -h * 0.6, 1.5 * u], [half + 1.2 * u, -h * 0.6, 1.5 * u], [0, -1.6 * u, 2.2 * u]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  // Everything drawn so far sits BEHIND the face
  k.hole = () => {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(c, c, D / 2 - 0.5, 0, TAU); ctx.fill(); ctx.restore();
  };
  // Things placed once per avatar (sparkle spots, the star field)
  k.fixed = (n, make) => {
    if (!k.S.fixed.length) for (let i = 0; i < n; i++) k.S.fixed.push(make(i));
    return k.S.fixed;
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
