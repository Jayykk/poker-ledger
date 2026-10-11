import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// A mystery draw must not be readable anywhere before the TV reveals it
const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

describe('mystery draw: nothing gives the envelope away early', () => {
  it('the phone result overlay is opaque, not a see-through dim', () => {
    const reveal = read('src/components/tournament/MysteryPhoneReveal.vue');
    expect(reveal).toMatch(/\.mpr \{[^}]*background: rgb\(var\(--tw-slate-950\)\);/);
    expect(reveal).not.toContain('background: rgb(0 0 0 / 0.72)');
  });

  it('a draw landing while the screen is open is held as long as the TV reveal', () => {
    const view = read('src/views/MysteryDrawView.vue');
    expect(view).toContain('const REVEAL_HOLD_MS = 6500;');
    // the drawn amount and the envelopes-left count both wait
    expect(view).toContain("freshIds.has(tk.id) ? '$ ?'");
    expect(view).toContain("× {{ holding ? '?' : tier.left }} / {{ tier.total }}");
    expect(view).toContain(':class="{ gone: !tier.left && !holding }"');
    // only with a clock (the TV stage); draws already there on open show as usual
    expect(view).toContain("if (!added.length || !game.value?.tournamentSessionId) return;");
    expect(view).toContain('const added = seenReady ? ids.filter((id) => !seenDrawn.has(id)) : [];');
  });
});
