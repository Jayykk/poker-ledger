import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { ref, nextTick, effectScope } from 'vue';

// The game listener: tests push snapshots through `emit`
let emit = null;
vi.mock('../src/firebase-init.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => ({ col, id }),
  onSnapshot: (_ref, cb) => {
    emit = (data) => cb({ exists: () => true, id: 'g1', data: () => data });
    return () => {};
  },
}));

const { useMysteryStage } = await import('../src/composables/useMysteryStage.js');

const ticket = (id, envelope = null, drawnAt = null) => ({ id, by: ['p1'], holderId: 'p2', envelope, drawnAt });
const gameWith = (...tickets) => ({
  bounty: { type: 'mystery', envelopes: [{ share: 1, count: 3 }] },
  players: [{ id: 'p1', name: 'A', mysteryTickets: tickets }, { id: 'p2', name: 'B' }],
});

function setup() {
  const scope = effectScope();
  const stage = scope.run(() => useMysteryStage(ref('g1')));
  return stage;
}

describe('useMysteryStage', () => {
  beforeEach(() => { emit = null; });

  it('reveals a draw made on this screen right away', async () => {
    const s = setup();
    emit(gameWith(ticket('t1')));
    expect(s.pendingCount.value).toBe(1);
    s.markDrawn('t1', 2);
    await nextTick();
    expect(s.current.value).toMatchObject({ id: 't1', envelope: 2 });
    expect(s.pendingCount.value).toBe(0);
    // the listener bringing it back doesn't queue it twice
    emit(gameWith(ticket('t1', 2, Date.now())));
    expect(s.queue.value).toHaveLength(1);
  });

  it('a snapshot from before our own draw is not an undo', () => {
    const s = setup();
    emit(gameWith(ticket('t1')));
    s.markDrawn('t1', 0);
    s.next(); // revealed
    emit(gameWith(ticket('t1'))); // stale
    emit(gameWith(ticket('t1', 0, Date.now())));
    expect(s.queue.value).toHaveLength(0);
  });

  it('still queues draws made elsewhere, and replays a re-draw after an undo', () => {
    const s = setup();
    emit(gameWith(ticket('t1')));
    emit(gameWith(ticket('t1', 1, Date.now())));
    expect(s.current.value?.id).toBe('t1');
    s.next();
    emit(gameWith(ticket('t1'))); // undone
    emit(gameWith(ticket('t1', 2, Date.now())));
    expect(s.current.value).toMatchObject({ id: 't1', envelope: 2 });
  });

  it('ignores a draw already shown', () => {
    const s = setup();
    emit(gameWith(ticket('t1')));
    emit(gameWith(ticket('t1', 1, Date.now())));
    s.markDrawn('t1', 1);
    expect(s.queue.value).toHaveLength(1);
  });
});

describe('TV stage reveal', () => {
  const stage = fs.readFileSync('src/components/tournament/MysteryStage.vue', 'utf8');
  it('always finishes: steps time out, and the end runs in finally', () => {
    expect(stage).toMatch(/const step = \(anim, ms\) => Promise\.race/);
    expect(stage).not.toMatch(/\}\)\.finished;/);
    expect(stage).toMatch(/finally \{[\s\S]*?reveal\.value = null;[\s\S]*?emit\('done', tk\);/);
  });
  it('awaits the draw and says when it failed', () => {
    expect(stage).toContain('onDraw: { type: Function');
    expect(stage).toContain("$t('mystery.drawFailed')");
  });
  for (const f of ['src/views/TournamentClockView.vue', 'src/views/DealerClockView.vue']) {
    it(`${f}: reveals its own draw now and goes back to the clock when all are drawn`, () => {
      const v = fs.readFileSync(f, 'utf8');
      expect(v).toContain('if (ok) stageMarkDrawn(ticket.id, slot);');
      expect(v).toContain('return ok;');
      expect(v).toMatch(/!stagePending\.value\) \{\s*setMysteryStage\(false\)/);
    });
  }
});
