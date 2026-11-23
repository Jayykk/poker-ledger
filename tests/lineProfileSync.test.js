import { describe, it, expect } from 'vitest';
import { lineProfileStale, lineProfileKey, storedPhotoOf } from '../src/utils/lineProfileSync.js';

const PIC = 'https://profile.line-scdn.net/abc';
const user = (over = {}) => ({ uid: 'line_U1', isAnonymous: false, photoURL: `${PIC}/small`, displayName: 'Jay', ...over });
const profile = (over = {}) => ({ userId: 'U1', pictureUrl: PIC, displayName: 'Jay', ...over });

describe('lineProfileStale', () => {
  it('is false when the account matches LINE', () => {
    expect(lineProfileStale(user(), profile())).toBe(false);
  });

  it('is true when LINE has a new photo', () => {
    expect(lineProfileStale(user(), profile({ pictureUrl: 'https://profile.line-scdn.net/new' }))).toBe(true);
  });

  it('is true when the account has no photo yet', () => {
    expect(lineProfileStale(user({ photoURL: null }), profile())).toBe(true);
  });

  it('is true when the LINE name changed', () => {
    expect(lineProfileStale(user(), profile({ displayName: 'Jay K' }))).toBe(true);
  });

  it('ignores a LINE profile without a photo or name', () => {
    expect(lineProfileStale(user(), profile({ pictureUrl: undefined, displayName: '' }))).toBe(false);
  });

  it('leaves other accounts alone', () => {
    expect(lineProfileStale(user({ uid: 'emailUid' }), profile({ pictureUrl: 'x' }))).toBe(false);
    expect(lineProfileStale(user({ uid: 'line_U2' }), profile({ pictureUrl: 'x' }))).toBe(false);
    expect(lineProfileStale(user({ isAnonymous: true }), profile({ pictureUrl: 'x' }))).toBe(false);
    expect(lineProfileStale(null, profile())).toBe(false);
    expect(lineProfileStale(user(), null)).toBe(false);
  });
});

describe('storedPhotoOf / lineProfileKey', () => {
  it('stores the small size, like lineLogin', () => {
    expect(storedPhotoOf(PIC)).toBe(`${PIC}/small`);
    expect(storedPhotoOf('')).toBe('');
  });

  it('changes with the photo or the name', () => {
    const k = lineProfileKey(profile());
    expect(lineProfileKey(profile())).toBe(k);
    expect(lineProfileKey(profile({ pictureUrl: 'x' }))).not.toBe(k);
    expect(lineProfileKey(profile({ displayName: 'x' }))).not.toBe(k);
  });
});
