// Geometry for the 抽座位 table view (SeatTable.vue): an oval table seen from
// above at an angle, with the dealer position and seats 1..9 around it, that
// turns about its vertical axis as the user drags. Plain orthographic maths —
// world (x, z) on the floor → rotate by theta → squash z for the tilt.

import { SEAT_COUNT } from './seatDraw.js';

/** Drawing box (SVG viewBox units). */
export const VIEW = { w: 360, h: 316, cx: 180, cy: 152 };
/** Table top semi-axes on the floor, and how much the tilt squashes depth. */
export const TABLE = { a: 90, b: 74, tilt: 0.8 };
/** Positions around the table: the dealer (index 0) plus the numbered seats. */
export const POSITIONS = SEAT_COUNT + 1;

/** Floor point → screen point (and depth, for draw order) at rotation theta. */
export function project(x, z, theta = 0) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const depth = x * sin + z * cos;
  return { x: VIEW.cx + x * cos - z * sin, y: VIEW.cy + depth * TABLE.tilt, depth };
}

/**
 * Where position `index` (0 = dealer, 1..9 = seats, clockwise from the dealer
 * at the far side) lands on screen, `grow` units out from the table edge.
 */
export function seatPoint(index, theta = 0, grow = 0) {
  const phi = -Math.PI / 2 + (index * 2 * Math.PI) / POSITIONS;
  return project((TABLE.a + grow) * Math.cos(phi), (TABLE.b + grow) * Math.sin(phi), theta);
}

/** SVG path of the table oval grown by `grow`, shifted down by `dy`. */
export function ovalPath(theta = 0, grow = 0, dy = 0, steps = 48) {
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i * 2 * Math.PI) / steps;
    const p = project((TABLE.a + grow) * Math.cos(t), (TABLE.b + grow) * Math.sin(t), theta);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)},${(p.y + dy).toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * The rotation that brings position `index` to the near side, centred — the
 * view from that seat (`grow`: how far out the seats sit, as in seatPoint).
 * No seat (a spectator) → 0: the dealer at the far side.
 */
export function homeTheta(index, grow = 0) {
  if (index === null || index === undefined || index < 0) return 0;
  const phi = -Math.PI / 2 + (index * 2 * Math.PI) / POSITIONS;
  return Math.PI / 2 - Math.atan2((TABLE.b + grow) * Math.sin(phi), (TABLE.a + grow) * Math.cos(phi));
}

/** `home` plus whole turns, whichever is nearest to theta (what 回正 eases to). */
export const nearestHome = (theta, home = 0) => home + Math.round((theta - home) / (2 * Math.PI)) * 2 * Math.PI;

/** Rough rendered width of a name: full-width (CJK …) glyphs are ~1.7× latin. */
export function textWidth(text = '', latin = 6.6, wide = 11.4) {
  let w = 0;
  for (const ch of String(text)) w += ch.codePointAt(0) > 0x2e7f ? wide : latin;
  return w;
}

/** `text` cut with an ellipsis so it fits `max` (same units as textWidth). */
export function fitText(text = '', max = 0, latin = 6.6, wide = 11.4) {
  const s = String(text);
  if (textWidth(s, latin, wide) <= max) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(`${out}${ch}…`, latin, wide) > max) break;
    out += ch;
  }
  return `${out}…`;
}

const overlap = (a, b, gap) => ({
  x: (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x),
  y: (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y),
});

/**
 * Lay the name pills out so none covers another or someone's avatar: each
 * starts under its own avatar and overlapping ones push apart along whichever
 * axis takes the smaller move — so long names stay readable instead of being
 * cut short. Deterministic (same input, same layout).
 *
 * @param {Array<{ x:number, y:number, w:number, h:number }>} labels centres + sizes, wanted positions
 * @param {Array<{ x:number, y:number, w:number, h:number }>} blocks fixed boxes to keep clear of (avatars)
 * @param {{ w:number, h:number }} [box] area the pills must stay inside
 * @return {Array<{ x:number, y:number }>} settled centres, same order as `labels`
 */
export function spreadLabels(labels = [], blocks = [], box = VIEW) {
  const out = labels.map((l) => ({ ...l }));
  const clamp = (l) => {
    l.x = Math.min(box.w - l.w / 2 - 2, Math.max(l.w / 2 + 2, l.x));
    l.y = Math.min(box.h - l.h / 2 - 2, Math.max(l.h / 2 + 2, l.y));
  };
  out.forEach(clamp);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      // Other pills: both give way
      for (let j = i + 1; j < out.length; j++) {
        const b = out[j];
        const o = overlap(a, b, 3);
        if (o.x <= 0 || o.y <= 0) continue;
        moved = true;
        // The shorter way out — but a pair still stuck after a while (pinned
        // against the edge or an avatar) tries the other axis on odd passes
        const sideways = pass > 12 && pass % 2 ? o.x >= o.y : o.x < o.y;
        if (sideways) {
          const dir = a.x === b.x ? (i < j ? -1 : 1) : Math.sign(a.x - b.x);
          a.x += (dir * o.x) / 2;
          b.x -= (dir * o.x) / 2;
        } else {
          const dir = a.y === b.y ? (i < j ? -1 : 1) : Math.sign(a.y - b.y);
          a.y += (dir * o.y) / 2;
          b.y -= (dir * o.y) / 2;
        }
      }
      // Avatars don't move: the pill steps aside
      for (const blk of blocks) {
        const o = overlap(a, blk, 1);
        if (o.x <= 0 || o.y <= 0) continue;
        moved = true;
        if (o.x < o.y) a.x += (a.x >= blk.x ? 1 : -1) * o.x;
        else a.y += (a.y >= blk.y ? 1 : -1) * o.y;
      }
      clamp(a);
    }
    if (!moved) break;
  }
  return out.map(({ x, y }) => ({ x, y }));
}
