import { describe, expect, it, vi } from 'vitest';

// middleware.ts imports ./auth, which pulls in next-auth's `next/server`
// dependency — not resolvable under vitest. Only `config` is under test here.
vi.mock('./auth', () => ({
  auth: (handler: unknown) => handler,
}));

import { config } from './middleware';

// The routing-layer half of the gate. Each route also re-checks auth itself,
// but a missing matcher entry silently removes a layer, and nothing else in
// the suite would notice.
describe('middleware matcher', () => {
  it('covers the bare /admin path as well as its subpaths', () => {
    expect(config.matcher).toContain('/admin');
    expect(config.matcher).toContain('/admin/:path*');
  });

  it('covers the Puck catch-all', () => {
    expect(config.matcher).toContain('/api/puck/:path*');
  });

  // Both upload routes are plain routes, not catch-alls, so each must be
  // listed BARE — a ':path*' entry would never match either one.
  it('lists both upload routes bare', () => {
    expect(config.matcher).toContain('/api/upload');
    expect(config.matcher).toContain('/api/gallery-upload');
    expect(config.matcher).not.toContain('/api/upload/:path*');
    expect(config.matcher).not.toContain('/api/gallery-upload/:path*');
  });

  // It serves the avatar to every visitor of the public page.
  it('leaves /api/media ungated', () => {
    expect(config.matcher.some((m) => m.startsWith('/api/media'))).toBe(false);
  });
});
