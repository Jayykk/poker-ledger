import { describe, it, expect } from 'vitest';
import {
  VIEW, TABLE, POSITIONS, project, seatPoint, ovalPath, homeTheta, nearestHome, textWidth, fitText, spreadLabels,
} from '../src/utils/seatTableLayout.js';

describe('seatTableLayout', () => {
  it('has the dealer position plus nine seats', () => {
    expect(POSITIONS).toBe(10);
  });

  it('puts the dealer at the far side and seat 5 nearest, centred', () => {
    const dealer = seatPoint(0);
    const five = seatPoint(5);
    expect(dealer.x).toBeCloseTo(VIEW.cx);
    expect(five.x).toBeCloseTo(VIEW.cx);
    expect(dealer.y).toBeLessThan(VIEW.cy);
    expect(five.y).toBeGreaterThan(VIEW.cy);
    expect(dealer.depth).toBeLessThan(five.depth);
  });

  it('runs the seats clockwise from the dealer (seat 1 to its right)', () => {
    expect(seatPoint(1).x).toBeGreaterThan(VIEW.cx);
    expect(seatPoint(9).x).toBeLessThan(VIEW.cx);
  });

  it('keeps every seat inside the drawing box at any rotation', () => {
    for (let step = 0; step < 24; step++) {
      const theta = (step * Math.PI) / 12;
      for (let i = 0; i < POSITIONS; i++) {
        const p = seatPoint(i, theta, 40);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(VIEW.w);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(VIEW.h);
      }
    }
  });

  it('a half turn swaps the far and near sides', () => {
    const p = seatPoint(0, Math.PI);
    expect(p.y).toBeGreaterThan(VIEW.cy);
    expect(p.x).toBeCloseTo(VIEW.cx);
  });

  it('squashes depth by the tilt', () => {
    expect(project(0, 10).y - VIEW.cy).toBeCloseTo(10 * TABLE.tilt);
  });

  it('draws a closed oval path', () => {
    const d = ovalPath(0.3);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L').length).toBe(48);
  });

  it('回正 goes to the nearest full turn', () => {
    expect(nearestHome(0.4)).toBe(0);
    expect(nearestHome(5.9)).toBeCloseTo(2 * Math.PI);
    expect(nearestHome(-5.9)).toBeCloseTo(-2 * Math.PI);
  });

  it('home brings a seat to the near side, centred (the view from that seat)', () => {
    for (let i = 0; i < POSITIONS; i++) {
      const p = seatPoint(i, homeTheta(i, 40), 40);
      expect(p.x).toBeCloseTo(VIEW.cx);
      expect(p.y).toBeGreaterThan(VIEW.cy);
    }
  });

  it('a spectator looks at the dealer on the far side', () => {
    expect(homeTheta(null)).toBe(0);
    expect(homeTheta(undefined)).toBe(0);
  });

  it('回正 picks the turn of home nearest to where the table is', () => {
    const home = homeTheta(3);
    expect(nearestHome(home + 0.5, home)).toBeCloseTo(home);
    expect(nearestHome(home + 6, home)).toBeCloseTo(home + 2 * Math.PI);
  });
});

describe('names on the seat table', () => {
  const hits = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

  it('counts full-width glyphs wider than latin ones', () => {
    expect(textWidth('abc')).toBeCloseTo(19.8);
    expect(textWidth('東尼')).toBeCloseTo(22.8);
    expect(textWidth('')).toBe(0);
  });

  it('cuts a title that does not fit, and leaves one that does', () => {
    expect(fitText('Poker', 100)).toBe('Poker');
    const cut = fitText('週五德州撲克之夜友誼賽', 80);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut)).toBeLessThanOrEqual(80);
  });

  it('leaves pills alone when nothing overlaps', () => {
    const labels = [{ x: 60, y: 60, w: 40, h: 17 }, { x: 200, y: 200, w: 40, h: 17 }];
    expect(spreadLabels(labels)).toEqual([{ x: 60, y: 60 }, { x: 200, y: 200 }]);
  });

  it('pushes overlapping pills apart and keeps them in the box', () => {
    const labels = [
      { x: 150, y: 250, w: 130, h: 17 },
      { x: 190, y: 252, w: 130, h: 17 },
      { x: 350, y: 250, w: 120, h: 17 },
    ];
    const out = spreadLabels(labels).map((p, i) => ({ ...labels[i], ...p }));
    expect(hits(out[0], out[1])).toBe(false);
    expect(hits(out[1], out[2])).toBe(false);
    for (const l of out) {
      expect(l.x - l.w / 2).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w / 2).toBeLessThanOrEqual(VIEW.w);
      expect(l.y + l.h / 2).toBeLessThanOrEqual(VIEW.h);
    }
  });

  it('keeps pills off the avatars', () => {
    const avatar = { x: 100, y: 100, w: 40, h: 46 };
    const [p] = spreadLabels([{ x: 104, y: 110, w: 60, h: 17 }], [avatar]);
    expect(hits({ ...p, w: 60, h: 17 }, avatar)).toBe(false);
  });

  it('settles a full table with a few long names at every rotation', () => {
    // a realistic mix: most names short, three long ones
    const widths = [60, 34, 110, 40, 130, 46, 30, 120, 52, 40];
    for (let step = 0; step < 12; step++) {
      const theta = (step * Math.PI) / 6;
      const pts = Array.from({ length: POSITIONS }, (_, i) => seatPoint(i, theta, 40));
      const labels = pts.map((at, i) => ({ x: at.x, y: at.y + 33, w: widths[i], h: 17 }));
      const out = spreadLabels(labels, pts.map((at) => ({ x: at.x, y: at.y + 2, w: 40, h: 46 })));
      let clashes = 0;
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          // touching by a pixel or two is not a visible clash
          const A = { ...labels[i], ...out[i] };
          const B = { ...labels[j], ...out[j] };
          if (hits({ ...A, w: A.w - 2, h: A.h - 2 }, { ...B, w: B.w - 2, h: B.h - 2 })) clashes++;
        }
      }
      expect(clashes).toBe(0);
    }
  });
});
