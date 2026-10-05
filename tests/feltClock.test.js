import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve(__dirname, '..', 'src/components/tournament/FeltClockBoard.vue'), 'utf-8');

describe('style 2 (felt) clock: side rails readable from across the room', () => {
  it('the rails get more width', () => {
    expect(css).toContain('grid-template-columns: 1.15fr 2fr 1.15fr;');
  });
  it('rail numbers, labels, payouts and the next level are larger', () => {
    expect(css).toMatch(/\.stat \.k \{\s*font: 600 calc\(var\(--u\) \* 1\.55\)/);
    expect(css).toMatch(/\.stat \.v \{\s*font: 700 calc\(var\(--u\) \* 5\)/);
    expect(css).toContain('.stat.big .v { font-size: calc(var(--u) * 6.4); }');
    expect(css).toContain('font: 600 calc(var(--u) * 2.7) / 1.1 var(--f-display);');
    expect(css).toMatch(/\.next \{\s*font: 600 calc\(var\(--u\) \* 2\)/);
  });
});
