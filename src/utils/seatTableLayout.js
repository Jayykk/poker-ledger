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
