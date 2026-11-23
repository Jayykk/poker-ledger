/**
 * 頭像框 earn times: userTitles.frames { frameId: at } for the tier and themed
 * frames (crown frames take their months from the crowns).
 */
import { describe, it, expect } from 'vitest';
import {
  buildUserTitles, lastingFrames, sameFrames, trackFrames, TITLE_LADDER_VERSION,
} from '../functions/src/utils/titleRules.js';

// 5 + 5 = 10 titles (bronze); regular / host at tier 5 earn clock / carnival
const ten = { regular: { tier: 5, at: 50 }, host: { tier: 5, at: 60 } };

describe('frame earn times', () => {
  it('lasting frames: the tier frames up to the earned one, then the themed ones', () => {
    expect(lastingFrames(ten)).toEqual(['bronze', 'clock', 'carnival']);
    expect(lastingFrames({ regular: { tier: 4, at: 1 } })).toEqual([]);
    expect(lastingFrames(null)).toEqual([]);
  });

  it('a frame earned by this update gets now; stored times stay', () => {
    const before = { regular: { tier: 5, at: 50 }, host: { tier: 4, at: 40 } };
    const frames = trackFrames({ clock: 50 }, before, ten, 999);
    expect(frames).toEqual({ clock: 50, bronze: 999, carnival: 999 });
  });

  it('earned before times were recorded: a themed frame on its minTier takes that step, else 0', () => {
    const higher = { regular: { tier: 7, at: 70 }, host: { tier: 5, at: 60 } };
    expect(trackFrames(undefined, higher, higher, 999)).toEqual({ bronze: 0, clock: 0, carnival: 60 });
  });

  it('a frame a rebuild took away drops out', () => {
    const lowered = { regular: { tier: 5, at: 50 }, host: { tier: 4, at: 60 } };
    expect(trackFrames({ bronze: 1, clock: 2, carnival: 3 }, ten, lowered, 999)).toEqual({ clock: 2 });
  });

  it('sameFrames: missing is empty', () => {
    expect(sameFrames(undefined, {})).toBe(true);
    expect(sameFrames({ bronze: 0 }, { bronze: 0 })).toBe(true);
    expect(sameFrames({ bronze: 0 }, { bronze: 1 })).toBe(false);
    expect(sameFrames({ bronze: 0 }, {})).toBe(false);
  });

  it('buildUserTitles records a frame the game earned, and writes the doc for it', () => {
    const prev = {
      ladder: TITLE_LADDER_VERSION,
      unlocked: { regular: { tier: 5, at: 50 }, host: { tier: 4, at: 40 } },
      prefs: { mode: 'off', frame: 'auto' },
      display: null,
      frames: { clock: 50 },
    };
    // host reaches tier 5 (35 hosted games): bronze + carnival
    const stats = { total: { games: 50, hostedGames: 35 }, cash: {}, tournament: {} };
    const next = buildUserTitles(prev, stats, 777);
    expect(next.frames).toEqual({ clock: 50, bronze: 777, carnival: 777 });
    expect(next.changed).toBe(true);
    const again = buildUserTitles({ ...prev, unlocked: next.unlocked, display: next.display, frames: next.frames }, stats, 888);
    expect(again.frames).toEqual(next.frames);
    expect(again.changed).toBe(false);
  });
});
