/**
 * Validates `Hero.avatarUrl` before it can be stored or rendered as an
 * `<img src>`.
 *
 * Two shapes are allowed, and they need separate checks:
 *
 * - A relative `/api/media/<uuid>.<ext>` path, which is what an upload
 *   through `/api/upload` produces. `Image.tsx`'s `isSafeHttpUrl` can't be
 *   reused for this: it runs `new URL(value)`, which *throws* on a relative
 *   path, so every uploaded avatar would be rejected as unsafe.
 * - An absolute http(s) URL, for an image the owner hosts elsewhere. This
 *   half is the same rule `isSafeHttpUrl` enforces, for the same reason —
 *   a `javascript:` or `data:` value must never reach a live `src`.
 *
 * The relative form is matched against an explicit pattern rather than a
 * `startsWith('/api/media/')` prefix test, so that `..` segments, a query
 * string, or a second path segment can't smuggle anything past it.
 */
const MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9-]+\.[a-z0-9]+$/;

export function isSafeAvatarUrl(url: string): boolean {
  if (MEDIA_PATH.test(url)) return true;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
