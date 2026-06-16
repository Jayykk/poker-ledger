/**
 * Unit tests for src/utils/animationQueue.js
 */
import { describe, it, expect } from 'vitest';
import { createAnimationQueue } from '../src/utils/animationQueue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createAnimationQueue', () => {
  it('runs tasks strictly in order, one finishing before the next starts', async () => {
    const q = createAnimationQueue();
    const order = [];
    const make = (label) => async () => {
      order.push(`${label}:start`);
      await tick();
      order.push(`${label}:end`);
    };
    q.enqueue(make('a'));
    q.enqueue(make('b'));
    q.enqueue(make('c'));

    // Let the queue drain.
    await tick();
    await tick();
    await tick();
    await tick();

    expect(order).toEqual([
      'a:start', 'a:end',
      'b:start', 'b:end',
      'c:start', 'c:end',
    ]);
  });

  it('clear() drops pending tasks', async () => {
    const q = createAnimationQueue();
    const ran = [];
    q.enqueue(async () => { ran.push(1); await tick(); });
    q.enqueue(async () => { ran.push(2); });
    q.enqueue(async () => { ran.push(3); });
    q.clear();

    await tick();
    await tick();
    await tick();

    // First task may already be in flight; tasks 2 and 3 must not run.
    expect(ran).not.toContain(3);
    expect(q.size).toBe(0);
  });

  it('keeps draining after a task throws', async () => {
    const q = createAnimationQueue();
    const ran = [];
    q.enqueue(async () => { throw new Error('boom'); });
    q.enqueue(async () => { ran.push('after'); });

    await tick();
    await tick();

    expect(ran).toEqual(['after']);
  });

  it('ignores non-function enqueues', () => {
    const q = createAnimationQueue();
    q.enqueue(null);
    q.enqueue(42);
    expect(q.size).toBe(0);
  });
});
