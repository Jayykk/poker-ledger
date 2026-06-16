/**
 * Animation queue
 * Serializes async animation/sound steps so that bursts of Firestore snapshot
 * updates (e.g. an all-in runout dealing flop+turn+river almost at once) play
 * one step at a time instead of overlapping or being dropped — no flicker, no
 * "blast every sound simultaneously".
 *
 * Pure and framework-agnostic so it can be unit-tested directly.
 */

/**
 * @return {{
 *   enqueue: (task: () => (void|Promise<void>)) => void,
 *   clear: () => void,
 *   size: number,
 *   isRunning: boolean,
 * }}
 */
export function createAnimationQueue() {
  const tasks = [];
  let running = false;
  let cleared = false;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (tasks.length) {
        if (cleared) break;
        const task = tasks.shift();
        try {
          await task();
        } catch {
          // A failed step must not stall the rest of the queue.
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    /** Add a task and (re)start draining. */
    enqueue(task) {
      if (typeof task !== 'function') return;
      cleared = false;
      tasks.push(task);
      // Fire-and-forget; drain awaits each task in order.
      drain();
    },
    /** Drop all pending tasks and stop the current drain loop. */
    clear() {
      tasks.length = 0;
      cleared = true;
    },
    get size() {
      return tasks.length;
    },
    get isRunning() {
      return running;
    },
  };
}
