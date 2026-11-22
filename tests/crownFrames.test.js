/**
 * 王座框: a frame per 本月王座, wearable only in a month that crown is held.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  ALL_FRAME_IDS, CROWN_FRAMES, CROWN_FRAME_IDS, FRAME_IDS, THEME_FRAME_IDS,
  earnedCrownFrames, getCrownFrame, isFrameEarned, resolveFrame, resolveDisplay,
  validateTitlePrefs, effectiveDisplay, buildCrownUpdate, sameDisplay,
} from '../functions/src/utils/titleRules.js';
import { CROWN_IDS } from '../functions/src/utils/crownRules.js';
import * as fx from '../src/utils/frameFx.js';

const NOV = '2026-11';
const DEC = '2026-12';
const held = (ids, month = NOV) => ({ crowns: Object.fromEntries(ids.map((id) => [id, month])), month: NOV });
// 50 titles held: the gold tier frame
const gold = Object.fromEntries(['regular', 'host', 'netWin', 'netLoss', 'hotStreak'].map((id) => [id, { tier: 10, at: 1 }]));

describe('王座框', () => {
  it('the catalog: one frame per crown, ids apart from every other frame, each with a drawing and a name', () => {
    expect(CROWN_FRAMES.map((f) => f.crown).sort()).toEqual([...CROWN_IDS].sort());
    expect(CROWN_FRAME_IDS).toEqual(CROWN_FRAMES.map((f) => f.id));
    expect(ALL_FRAME_IDS).toEqual([...FRAME_IDS, ...THEME_FRAME_IDS, ...CROWN_FRAME_IDS]);
    expect(new Set(ALL_FRAME_IDS).size).toBe(ALL_FRAME_IDS.length);
    for (const f of CROWN_FRAMES) {
      expect(getCrownFrame(f.id)).toBe(f);
      expect(fx.hasFrameFx(f.id), f.id).toBe(true);
    }
    expect(getCrownFrame('gold')).toBeNull();
    for (const loc of ['zh-TW', 'zh-CN', 'en', 'ja']) {
      const t = JSON.parse(readFileSync(resolve(__dirname, `../src/i18n/locales/${loc}.json`), 'utf-8')).titles;
      for (const id of CROWN_FRAME_IDS) expect(t.frames[id], `${loc} ${id}`).toBeTruthy();
      for (const key of ['frameCrowns', 'frameCrownsHint', 'frameCrownNeed']) expect(t[key], `${loc} ${key}`).toBeTruthy();
    }
  });

  it('earned only while its crown is held this month', () => {
    expect(earnedCrownFrames(held(['crownProfit', 'crownHunter']))).toEqual(['mint', 'reticle']);
    expect(earnedCrownFrames(held(['crownProfit'], '2026-10'))).toEqual([]);
    expect(earnedCrownFrames(null)).toEqual([]);
    expect(isFrameEarned('mint', {}, held(['crownProfit']))).toBe(true);
    expect(isFrameEarned('mint', {}, held(['crownLoss']))).toBe(false);
    // titles never earn one, however many
    expect(isFrameEarned('mint', gold)).toBe(false);
  });

  it('picking one needs the crown; without it the request is refused', () => {
    expect(validateTitlePrefs({ frame: 'grace' }, {}, {}, held(['crownLoss'])).prefs.frame).toBe('grace');
    expect(validateTitlePrefs({ frame: 'grace' }, {}, gold, held(['crownProfit'])).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: 'grace' }, {}, gold).error).toBe('frame-locked');
  });

  it('shown while held; once the crown is gone the frame falls back like auto, and comes back with the crown', () => {
    const prefs = { frame: 'sunrise' };
    expect(resolveFrame(gold, prefs, held(['crownRegular']))).toBe('sunrise');
    expect(resolveFrame(gold, prefs, held([]))).toBe('gold');
    expect(resolveFrame({}, prefs, held([]))).toBeNull();
    expect(resolveFrame(gold, prefs)).toBe('gold');
    // auto never gives one
    expect(resolveFrame(gold, { frame: 'auto' }, held(['crownRegular']))).toBe('gold');
    expect(resolveFrame(gold, { frame: 'none' }, held(['crownRegular']))).toBeNull();
  });

  it('a display with a crown frame carries the month, so it goes stale at the month change', () => {
    const prefs = { mode: 'off', frame: 'tycoon' };
    const ctx = held(['crownBoss']);
    const display = resolveDisplay(gold, prefs, ctx);
    expect(display).toEqual({ familyId: null, tier: null, frame: 'tycoon', month: NOV });
    // a tier frame carries none
    expect(resolveDisplay(gold, { mode: 'off', frame: 'auto' }, ctx)).toEqual({ familyId: null, tier: null, frame: 'gold' });

    const doc = { ladder: 2, unlocked: gold, prefs, crowns: ctx.crowns, display };
    expect(effectiveDisplay(doc, NOV)).toBe(display);
    // December, before any function rewrote the doc: read again, crown gone
    expect(effectiveDisplay(doc, DEC)).toEqual({ familyId: null, tier: null, frame: 'gold' });
    expect(sameDisplay(display, { ...display, month: DEC })).toBe(false);
  });

  it('the monthly verdict rewrites the stored frame when the crown changes hands', () => {
    const prefs = { mode: 'off', frame: 'reticle' };
    const stored = { ladder: 2, unlocked: gold, prefs, crowns: { crownHunter: NOV }, crownHistory: { crownHunter: [NOV] },
      display: { familyId: null, tier: null, frame: 'reticle', month: NOV } };
    const lost = buildCrownUpdate(stored, [[DEC, []]], DEC);
    expect(lost.display).toEqual({ familyId: null, tier: null, frame: 'gold' });
    expect(lost.changed).toBe(true);
    const kept = buildCrownUpdate(stored, [[DEC, ['crownHunter']]], DEC);
    expect(kept.display).toEqual({ familyId: null, tier: null, frame: 'reticle', month: DEC });
  });

  it('the picker lists them in their own group, locked ones still and naming the crown', () => {
    const v = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(v).toContain('data-testid="frame-crowns"');
    expect(v).toContain(':disabled="titleSaving || cf.locked"');
    expect(v).toContain(':frame="cf.id" :still="cf.locked"');
    expect(v).toContain("need: t('titles.frameCrownNeed', { name: titleName({ t, te }, f.crown, CROWN_TIER) })");
  });
});
