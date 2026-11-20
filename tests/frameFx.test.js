import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { ALL_FRAME_IDS, FRAME_IDS, THEME_FRAME_IDS } from '../functions/src/utils/titleRules.js';

// 頭像框 effects (src/utils/frameFx.js): the canvas renderer and its shared
// loop. jsdom has no canvas, so a recording stand-in plays the 2D context and
// requestAnimationFrame is driven by hand.

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async () => ({ exists: () => false, data: () => null }),
  onSnapshot: () => () => {},
}));

function fakeCtx() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const count = (name) => calls.filter(([n]) => n === name).length;
  return new Proxy({ calls, count }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        calls.push([prop, args]);
        return String(prop).startsWith('create') ? gradient : undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

// A canvas whose context is the stand-in (or none at all)
function fakeCanvas(ctx = fakeCtx()) {
  const canvas = document.createElement('canvas');
  canvas.getContext = () => ctx;
  return Object.assign(canvas, { ctx });
}

let frames = [];
let cancelled = [];
let fx;
// Everything mounted in a test is taken down after it: a frame left in an
// old module's loop would answer the next test's attribute changes
let handles = [];
const mountFx = (...args) => {
  const handle = fx.mountFrame(...args);
  if (handle) handles.push(handle);
  return handle;
};
// Run the queued animation frames once, as the browser would at `time` ms
const step = (time) => {
  const due = frames;
  frames = [];
  for (const { cb } of due) cb(time);
};
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  frames = [];
  cancelled = [];
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push({ id: ++id, cb }); return id; });
  vi.stubGlobal('cancelAnimationFrame', (handle) => { cancelled.push(handle); frames = frames.filter((f) => f.id !== handle); });
  // A browser has 2D canvas (jsdom has none, and mountFrame checks)
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  document.documentElement.removeAttribute('data-fx');
  document.documentElement.removeAttribute('data-mode');
  // A fresh module each time: the loop and its watchers are module state
  vi.resetModules();
  fx = await import('../src/utils/frameFx.js');
});

afterEach(() => {
  for (const handle of handles) handle.destroy();
  handles = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.matchMedia;
});

describe('frame renderer registry', () => {
  it('every frame of the catalog has a draw function, and nothing else does', () => {
    expect([...fx.FRAME_FX_IDS].sort()).toEqual([...ALL_FRAME_IDS].sort());
    for (const id of ALL_FRAME_IDS) expect(fx.hasFrameFx(id), id).toBe(true);
    for (const id of ['auto', 'none', 'ruby', 'bloodmoon', 'goldTier', 'constructor', 'toString', '', null, undefined, 3]) {
      expect(fx.hasFrameFx(id), String(id)).toBe(false);
    }
    expect(FRAME_IDS.every(fx.hasFrameFx)).toBe(true);
    expect(THEME_FRAME_IDS.every(fx.hasFrameFx)).toBe(true);
  });

  it('every frame draws, moving and still, at every avatar size, and punches the face out', () => {
    for (const id of ALL_FRAME_IDS) {
      for (const size of [28, 40, 80]) {
        const ctx = fakeCtx();
        const render = fx.createFrameRenderer(ctx, id, size);
        expect(typeof render, id).toBe('function');
        expect(() => { for (let i = 0; i < 12; i++) render(i / 60); }, `${id} ${size}`).not.toThrow();
        expect(() => render(0.9, { still: true, light: true }), `${id} ${size} still`).not.toThrow();
        // Each draw starts from an empty canvas of the whole box
        const box = size * fx.FRAME_CANVAS_SCALE;
        expect(ctx.calls.find(([n]) => n === 'clearRect')[1]).toEqual([0, 0, box, box]);
        expect(ctx.count('clearRect'), id).toBe(13);
        // The hole: the face's circle, a hair inside its edge
        const half = box / 2;
        const holes = ctx.calls.filter(([n, a]) => n === 'arc' && a[0] === half && a[1] === half && a[2] === size / 2 - 0.5);
        expect(holes.length, `${id} hole`).toBe(13);
      }
    }
  });

  it('an unknown frame or no context gives no renderer', () => {
    expect(fx.createFrameRenderer(fakeCtx(), 'ruby', 40)).toBeNull();
    expect(fx.createFrameRenderer(null, 'gold', 40)).toBeNull();
  });

  it('a still picture spawns nothing: the same frame costs the same draws every time', () => {
    for (const id of ['fire', 'thunder', 'frost', 'abyss', 'tide']) {
      const ctx = fakeCtx();
      const render = fx.createFrameRenderer(ctx, id, 40);
      render(0.9, { still: true });
      const first = ctx.calls.length;
      for (let i = 0; i < 5; i++) render(0.9, { still: true });
      expect(ctx.calls.length, id).toBe(first * 6);
      // Moving, the same frame grows particles
      const moving = fakeCtx();
      const animate = fx.createFrameRenderer(moving, id, 40);
      vi.spyOn(Math, 'random').mockReturnValue(0.2);
      animate(0);
      const one = moving.calls.length;
      for (let i = 1; i < 8; i++) animate(i / 60);
      expect(moving.calls.length, `${id} moving`).toBeGreaterThan(one * 8);
      vi.restoreAllMocks();
    }
  });

  it('works without conic gradients (older browsers)', () => {
    const ctx = fakeCtx();
    ctx.createConicGradient = undefined;
    const render = fx.createFrameRenderer(ctx, 'diamond', 40);
    expect(() => render(1)).not.toThrow();
    expect(ctx.count('createLinearGradient')).toBeGreaterThan(0);
  });

  it('on a light page the glows get a dark backing first', () => {
    const dark = fakeCtx();
    fx.createFrameRenderer(dark, 'bronze', 40)(1);
    const light = fakeCtx();
    fx.createFrameRenderer(light, 'bronze', 40)(1, { light: true });
    expect(light.count('createRadialGradient')).toBe(dark.count('createRadialGradient') + 1);
    // Drawn before anything else of the frame
    const firstFill = light.calls.findIndex(([n]) => n === 'fill');
    const firstStroke = light.calls.findIndex(([n]) => n === 'stroke');
    expect(firstFill).toBeGreaterThan(-1);
    expect(firstFill).toBeLessThan(firstStroke);
  });

  it('the effect unit grows with the avatar up to 48px, then a quarter as fast', () => {
    expect(fx.frameUnit(28)).toBeCloseTo(0.28);
    expect(fx.frameUnit(40)).toBeCloseTo(0.4);
    expect(fx.frameUnit(48)).toBeCloseTo(0.48);
    // The profile header: 80px draws like a 56px avatar, not twice the 40px one
    expect(fx.frameUnit(80)).toBeCloseTo(0.56);
    expect(fx.frameUnit(80)).toBeLessThan(fx.frameUnit(40) * 1.5);
    expect(fx.frameUnit(0)).toBe(0);
    expect(fx.frameUnit(undefined)).toBe(0);
  });
});

describe('mountFrame and the shared loop', () => {
  it('sizes the canvas for the device (pixel ratio capped at 2) and draws at once', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const canvas = fakeCanvas();
    const handle = mountFx(canvas, 'gold', 40);
    expect(handle).not.toBeNull();
    expect(canvas.width).toBe(Math.round(40 * fx.FRAME_CANVAS_SCALE * 2));
    expect(canvas.height).toBe(canvas.width);
    expect(canvas.ctx.calls.find(([n]) => n === 'setTransform')[1]).toEqual([2, 0, 0, 2, 0, 0]);
    expect(canvas.ctx.count('clearRect')).toBe(1);
    expect(fx.mountedFrameCount()).toBe(1);
  });

  it('no 2D context (jsdom, a blocked canvas), an unknown frame or no size: nothing mounted, no loop', () => {
    const none = document.createElement('canvas');
    none.getContext = () => null;
    expect(fx.mountFrame(none, 'gold', 40)).toBeNull();
    const throws = document.createElement('canvas');
    throws.getContext = () => { throw new Error('blocked'); };
    expect(fx.mountFrame(throws, 'gold', 40)).toBeNull();
    expect(fx.mountFrame(fakeCanvas(), 'ruby', 40)).toBeNull();
    expect(fx.mountFrame(fakeCanvas(), 'gold', 0)).toBeNull();
    expect(fx.mountFrame(null, 'gold', 40)).toBeNull();
    expect(fx.mountedFrameCount()).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('where 2D canvas does not exist the context is never asked for', () => {
    vi.unstubAllGlobals();
    expect(typeof CanvasRenderingContext2D).toBe('undefined');
    const canvas = document.createElement('canvas');
    const getContext = vi.fn(() => fakeCtx());
    canvas.getContext = getContext;
    expect(fx.mountFrame(canvas, 'gold', 40)).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(fx.mountedFrameCount()).toBe(0);
  });

  it('one animation loop for every avatar; it ends when the last one is gone', () => {
    const a = fakeCanvas();
    const b = fakeCanvas();
    const c = fakeCanvas();
    const three = [fx.mountFrame(a, 'fire', 28), fx.mountFrame(b, 'king', 40), fx.mountFrame(c, 'tide', 80)];
    expect(fx.mountedFrameCount()).toBe(3);
    // Three avatars, one frame request
    expect(frames).toHaveLength(1);
    step(1000);
    expect(frames).toHaveLength(1);
    for (const canvas of [a, b, c]) expect(canvas.ctx.count('clearRect')).toBe(2);
    step(1017);
    for (const canvas of [a, b, c]) expect(canvas.ctx.count('clearRect')).toBe(3);

    three[0].destroy();
    step(1034);
    expect(a.ctx.count('clearRect')).toBe(3);
    expect(b.ctx.count('clearRect')).toBe(4);
    three[1].destroy();
    const pending = frames[0].id;
    three[2].destroy();
    expect(fx.mountedFrameCount()).toBe(0);
    expect(cancelled).toContain(pending);
    expect(frames).toHaveLength(0);
    // destroy twice is harmless
    expect(() => three[2].destroy()).not.toThrow();
  });

  it('at most ~60 draws a second, whatever the screen refreshes at', () => {
    const canvas = fakeCanvas();
    mountFx(canvas, 'gold', 40);
    step(1000);
    step(1008); // a 120Hz frame: too soon
    step(1017);
    step(1025);
    step(1034);
    expect(canvas.ctx.count('clearRect')).toBe(1 + 3);
    expect(frames).toHaveLength(1);
  });

  it('`still` (a locked frame in the picker): one picture, never in the loop', () => {
    const canvas = fakeCanvas();
    mountFx(canvas, 'thunder', 40, { still: true });
    expect(canvas.ctx.count('clearRect')).toBe(1);
    expect(frames).toHaveLength(0);
    // Next to a moving one it still isn't drawn again
    const moving = fakeCanvas();
    mountFx(moving, 'fire', 40);
    step(1000);
    step(1020);
    expect(moving.ctx.count('clearRect')).toBe(3);
    expect(canvas.ctx.count('clearRect')).toBe(1);
  });

  it('簡化特效: one static picture and no loop; flipping the switch is picked up without a reload', async () => {
    document.documentElement.setAttribute('data-fx', 'lite');
    expect(fx.frameFxStill()).toBe(true);
    const canvas = fakeCanvas();
    mountFx(canvas, 'fire', 40);
    expect(canvas.ctx.count('clearRect')).toBe(1);
    expect(frames).toHaveLength(0);

    // Off: the loop starts
    document.documentElement.removeAttribute('data-fx');
    await tick();
    expect(fx.frameFxStill()).toBe(false);
    expect(frames).toHaveLength(1);
    step(1000);
    step(1020);
    const drawn = canvas.ctx.count('clearRect');
    expect(drawn).toBeGreaterThanOrEqual(3);

    // On again: the loop runs out and a still picture is left
    document.documentElement.setAttribute('data-fx', 'lite');
    await tick();
    step(1040);
    expect(frames).toHaveLength(0);
    expect(canvas.ctx.count('clearRect')).toBe(drawn + 1);
    step(1060);
    expect(canvas.ctx.count('clearRect')).toBe(drawn + 1);
  });

  it('the system reduced-motion setting does not still the frames (only the switch does)', () => {
    const asked = [];
    window.matchMedia = (q) => { asked.push(q); return { matches: true, addEventListener() {} }; };
    expect(fx.frameFxStill()).toBe(false);
    const canvas = fakeCanvas();
    mountFx(canvas, 'king', 40);
    expect(frames).toHaveLength(1);
    step(1000);
    step(1020);
    expect(canvas.ctx.count('clearRect')).toBe(3);
    // The renderer never even looks at it
    expect(asked).toEqual([]);
    const src = readFileSync(resolve(__dirname, '../src/utils/frameFx.js'), 'utf-8');
    expect(src).not.toContain('matchMedia');
  });

  it('a still picture is redrawn when the theme changes (the light backing)', async () => {
    const canvas = fakeCanvas();
    mountFx(canvas, 'gold', 40, { still: true });
    const before = canvas.ctx.count('createRadialGradient');
    document.documentElement.setAttribute('data-mode', 'light');
    await tick();
    expect(canvas.ctx.count('clearRect')).toBe(2);
    expect(canvas.ctx.count('createRadialGradient')).toBe(before * 2 + 1);
  });

  it('a hidden tab stops the loop; it resumes when the tab comes back', () => {
    const canvas = fakeCanvas();
    mountFx(canvas, 'gold', 40);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    step(1000);
    expect(frames).toHaveLength(0);
    expect(canvas.ctx.count('clearRect')).toBe(1);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveLength(1);
    step(2000);
    expect(canvas.ctx.count('clearRect')).toBe(2);
  });

  it('avatars off screen are skipped (IntersectionObserver) but stay in the loop', () => {
    let report;
    const observed = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb) { report = cb; }
      observe(el) { observed.push(el); }
      unobserve(el) { observed.splice(observed.indexOf(el), 1); }
    });
    const near = fakeCanvas();
    const far = fakeCanvas();
    const handle = fx.mountFrame(near, 'gold', 40);
    mountFx(far, 'fire', 40);
    expect(observed).toEqual([near, far]);
    report([{ target: far, isIntersecting: false }]);
    step(1000);
    step(1020);
    expect(near.ctx.count('clearRect')).toBe(3);
    expect(far.ctx.count('clearRect')).toBe(1);
    expect(frames).toHaveLength(1);
    report([{ target: far, isIntersecting: true }]);
    step(1040);
    expect(far.ctx.count('clearRect')).toBe(2);
    handle.destroy();
    expect(observed).toEqual([far]);
  });
});

describe('PlayerAvatar and its frame canvas', () => {
  const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
  let PlayerAvatar;
  let contexts;
  let wrappers = [];

  beforeEach(async () => {
    contexts = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const ctx = fakeCtx();
      contexts.push(ctx);
      return ctx;
    });
    // The component and frameFx from the same fresh module graph
    ({ default: PlayerAvatar } = await import('../src/components/common/PlayerAvatar.vue'));
    fx = await import('../src/utils/frameFx.js');
  });
  afterEach(() => {
    for (const w of wrappers) w.unmount();
    wrappers = [];
  });
  // The canvas is mounted once the template ref is there: a tick after mount
  const at = async (props) => {
    const w = mount(PlayerAvatar, { props, global: { plugins: [i18n] }, attachTo: document.body });
    wrappers.push(w);
    await nextTick();
    return w;
  };

  it('a canvas only for a frame it can draw; none → the neutral ring, no canvas', async () => {
    for (const id of ALL_FRAME_IDS) {
      const w = await at({ name: 'A', frame: id });
      expect(fx.mountedFrameCount(), id).toBe(1);
      expect(w.find('canvas.pa-fx').exists(), id).toBe(true);
      expect(w.find('canvas.pa-fx').attributes('aria-hidden')).toBe('true');
      expect(w.classes()).toContain('pa-framed');
      w.unmount();
    }
    for (const id of [null, '', 'ruby', 'bloodmoon', 'auto', 'none']) {
      const w = await at({ name: 'A', frame: id });
      expect(w.find('canvas').exists(), String(id)).toBe(false);
      expect(w.classes()).toContain('frame-none');
      expect(w.classes()).not.toContain('pa-framed');
      w.unmount();
    }
    expect(fx.mountedFrameCount()).toBe(0);
  });

  it('registers on mount, unregisters on unmount, and follows the frame it is given', async () => {
    const a = await at({ name: 'A', frame: 'fire' });
    const b = await at({ name: 'B', frame: 'king', size: 'lg' });
    expect(fx.mountedFrameCount()).toBe(2);
    expect(frames).toHaveLength(1);
    // Sized from the avatar: sm 28 / md 40 / lg 80 (jsdom lays nothing out)
    expect(a.find('canvas').element.width).toBe(Math.round(40 * fx.FRAME_CANVAS_SCALE));
    expect(b.find('canvas').element.width).toBe(Math.round(80 * fx.FRAME_CANVAS_SCALE));

    await a.setProps({ frame: 'tide' });
    expect(fx.mountedFrameCount()).toBe(2);
    await a.setProps({ frame: null });
    expect(a.find('canvas').exists()).toBe(false);
    expect(fx.mountedFrameCount()).toBe(1);
    await a.setProps({ frame: 'gold', size: 'sm' });
    expect(a.find('canvas').element.width).toBe(Math.round(28 * fx.FRAME_CANVAS_SCALE));
    expect(fx.mountedFrameCount()).toBe(2);

    a.unmount();
    expect(fx.mountedFrameCount()).toBe(1);
    b.unmount();
    expect(fx.mountedFrameCount()).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('`still` and 簡化特效 leave one picture and no loop', async () => {
    const locked = await at({ name: 'A', frame: 'thunder', still: true });
    expect(fx.mountedFrameCount()).toBe(1);
    expect(contexts.at(-1).count('clearRect')).toBe(1);
    expect(frames).toHaveLength(0);
    // Unlocked later: it starts moving
    await locked.setProps({ still: false });
    expect(frames).toHaveLength(1);
    locked.unmount();

    document.documentElement.setAttribute('data-fx', 'lite');
    const lite = await at({ name: 'A', frame: 'fire' });
    expect(contexts.at(-1).count('clearRect')).toBe(1);
    expect(frames).toHaveLength(0);
    lite.unmount();
  });

  it('without a canvas context the avatar still renders (photo, crown, account dot)', async () => {
    HTMLCanvasElement.prototype.getContext.mockImplementation(() => null);
    const w = await at({ name: 'Amy', frame: 'king', crown: true, linked: true });
    expect(w.find('.pa-face').text()).toBe('A');
    expect(w.find('.pa-crown .fa-crown').exists()).toBe(true);
    expect(w.find('.pa-linked').exists()).toBe(true);
    expect(fx.mountedFrameCount()).toBe(0);
    expect(frames).toHaveLength(0);
    w.unmount();
  });

  it('the canvas never takes space or the pointer, and sits under the crown and the dot', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/common/PlayerAvatar.vue'), 'utf-8');
    const rule = src.match(/\.pa-fx \{([^}]*)\}/)[1];
    expect(rule).toMatch(/position: absolute;/);
    expect(rule).toMatch(/pointer-events: none;/);
    expect(rule).toMatch(/width: 210%;\s*height: 210%;/);
    expect(rule).toMatch(/transform: translate\(-50%, -50%\);/);
    expect(rule).toMatch(/z-index: 1;/);
    expect(fx.FRAME_CANVAS_SCALE).toBe(2.1);
    expect(src.match(/\.pa-crown \{([^}]*)\}/)[1]).toMatch(/z-index: 2;/);
    expect(src.match(/\.pa-linked \{([^}]*)\}/)[1]).toMatch(/z-index: 2;/);
    expect(src.match(/\.pa \{([^}]*)\}/)[1]).toMatch(/isolation: isolate;/);
    // The old per-frame CSS rings are gone: the canvas draws them
    expect(src).not.toMatch(/\.frame-(bronze|silver|gold|platinum|diamond) \{/);
    // The picker shows locked frames still
    const profile = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(profile).toContain(':frame="f.id" :still="f.locked" />');
    expect(profile).toContain(':frame="th.id" :still="th.locked" />');
  });
});
