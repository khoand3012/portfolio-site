import { describe, expect, it } from 'vitest';
import { isSafeAvatarUrl } from './avatarUrl';

describe('isSafeAvatarUrl', () => {
  it('accepts a relative media path produced by an upload', () => {
    expect(
      isSafeAvatarUrl('/api/media/3f1b2c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.webp'),
    ).toBe(true);
  });

  it('accepts an absolute http(s) URL the owner pasted', () => {
    expect(isSafeAvatarUrl('https://example.com/me.jpg')).toBe(true);
  });

  it('rejects a javascript: URL', () => {
    expect(isSafeAvatarUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(isSafeAvatarUrl('data:image/svg+xml;base64,AAAA')).toBe(false);
  });

  it('rejects a traversal attempt dressed up as a media path', () => {
    expect(isSafeAvatarUrl('/api/media/../../etc/passwd')).toBe(false);
    expect(isSafeAvatarUrl('/api/media/a.png?x=../..')).toBe(false);
  });

  it('rejects some other relative path', () => {
    expect(isSafeAvatarUrl('/admin')).toBe(false);
  });
});
