/**
 * Image compression helper tests. Only the pure sizing math is covered —
 * jsdom has no canvas so fileToCompressedBase64 is exercised manually.
 */
import { describe, it, expect } from 'vitest';
import { computeScaledSize } from '../src/utils/imageCompression.js';

describe('computeScaledSize', () => {
  it('scales landscape images by the longest side', () => {
    expect(computeScaledSize(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it('scales portrait images by the longest side', () => {
    expect(computeScaledSize(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('never upscales small images', () => {
    expect(computeScaledSize(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it('leaves images exactly at the limit unchanged', () => {
    expect(computeScaledSize(1280, 1280, 1280)).toEqual({ width: 1280, height: 1280 });
  });

  it('rounds and clamps to at least 1px', () => {
    expect(computeScaledSize(10000, 1, 1280)).toEqual({ width: 1280, height: 1 });
    expect(computeScaledSize(0, 0, 1280)).toEqual({ width: 1, height: 1 });
  });
});
