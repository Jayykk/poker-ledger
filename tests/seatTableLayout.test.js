import { describe, it, expect } from 'vitest';
import { VIEW, TABLE, POSITIONS, project, seatPoint, ovalPath, homeTheta, nearestHome } from '../src/utils/seatTableLayout.js';

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
