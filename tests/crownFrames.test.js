/**
 * 王座框: a frame per 本月王座, wearable through the month after its crown is
 * won (in November, the crowns of October).
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

const SEP = '2026-09';
const OCT = '2026-10';
const NOV = '2026-11';
const DEC = '2026-12';
const JAN = '2027-01';
// Crowns won in `won` (still under crowns, not yet moved to history), judged in NOV
const held = (ids, won = OCT) => ({ crowns: Object.fromEntries(ids.map((id) => [id, won])), month: NOV });
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
      expect(t.frameCrowns, `${loc} frameCrowns`).toBeTruthy();
      for (const key of ['howCrown', 'crownWearing', 'crownWon']) expect(t.codexDetail[key], `${loc} ${key}`).toBeTruthy();
    }
  });

  it('earned the month after its crown is won, never while the race still runs', () => {
    expect(earnedCrownFrames(held(['crownProfit', 'crownHunter']))).toEqual(['mint', 'reticle']);
    // won in October and already moved to history: the same
    expect(earnedCrownFrames({ crowns: {}, crownHistory: { crownProfit: [SEP, OCT] }, month: NOV })).toEqual(['mint']);
    // leading November's race: nothing to wear until December
    expect(earnedCrownFrames(held(['crownProfit'], NOV))).toEqual([]);
    // won in September: worn in October only
    expect(earnedCrownFrames(held(['crownProfit'], SEP))).toEqual([]);
    expect(earnedCrownFrames({ crownHistory: { crownProfit: [SEP] }, month: NOV })).toEqual([]);
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
    // December, before any function rewrote the doc: read again, worn out
    expect(effectiveDisplay(doc, DEC)).toEqual({ familyId: null, tier: null, frame: 'gold' });
    expect(sameDisplay(display, { ...display, month: DEC })).toBe(false);
  });

  it('the monthly verdict: led through November, worn in December whatever December brings', () => {
    const prefs = { mode: 'off', frame: 'reticle' };
    // Led November's race: nothing worn yet
    const stored = { ladder: 2, unlocked: gold, prefs, crowns: { crownHunter: NOV },
      display: { familyId: null, tier: null, frame: 'gold' } };
    const stillNov = buildCrownUpdate(stored, [[NOV, ['crownHunter']]], NOV);
    expect(stillNov.display).toEqual({ familyId: null, tier: null, frame: 'gold' });
    expect(stillNov.changed).toBe(false);
    // December: November is settled and worn, led again or not
    for (const decHeld of [[], ['crownHunter']]) {
      const dec = buildCrownUpdate(stored, [[DEC, decHeld]], DEC);
      expect(dec.crownHistory).toEqual({ crownHunter: [NOV] });
      expect(dec.display).toEqual({ familyId: null, tier: null, frame: 'reticle', month: DEC });
      expect(dec.changed).toBe(true);
    }
    // January after a December without it: back to the tier frame
    const dec = buildCrownUpdate(stored, [[DEC, []]], DEC);
    const jan = buildCrownUpdate({ ...stored, ...dec }, [[JAN, []]], JAN);
    expect(jan.display).toEqual({ familyId: null, tier: null, frame: 'gold' });
  });

  it('a new wearer shows the crown at the month change, before any game rewrote the doc', () => {
    const prefs = { mode: 'off', frame: 'reticle' };
    // Written in November while leading: the tier frame, no month
    const doc = { ladder: 2, unlocked: gold, prefs, crowns: { crownHunter: NOV },
      display: { familyId: null, tier: null, frame: 'gold' } };
    expect(effectiveDisplay(doc, NOV)).toBe(doc.display);
    expect(effectiveDisplay(doc, DEC)).toEqual({ familyId: null, tier: null, frame: 'reticle', month: DEC });
  });

  it('the picker lists them in their own group, earned from the month after the win', () => {
    const v = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(v).toContain("testid: 'frame-crowns'");
    expect(v).toContain('earnedCrownFrames(crownCtxOf(myTitles.value, currentCrownMonth()))');
    expect(v).toContain(':disabled="titleSaving || f.locked"');
  });
});
