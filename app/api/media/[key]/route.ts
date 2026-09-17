import { getMediaStore } from '../../../../src/lib/mediaStore';

// Public on purpose: this serves the avatar to every visitor of the public
// page. Only opaque UUID keys written by /api/upload are reachable, and the
// pattern below is what keeps that true.
const KEY_PATTERN = /^[A-Za-z0-9-]+\.[a-z0-9]+$/;

export async function GET(
  _request: Request,
  // Next 15 hands route params in as a Promise — awaiting it is required, not
  // stylistic (a sync read returns the Promise object itself).
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;

  // Belt and braces alongside the store's own key handling: the segment is
  // matched against an explicit allow-list pattern so a decoded traversal
  // sequence can never be joined onto the local-dev store's base directory.
  if (!KEY_PATTERN.test(key)) {
    return new Response('Not found', { status: 404 });
  }

  const media = await getMediaStore().get(key);
  if (!media) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(media.bytes, {
    headers: {
      'Content-Type': media.contentType,
      // Immutable: the key is a fresh UUID per upload, so a given key's bytes
      // never change — replacing the avatar writes a new key and updates the
      // stored URL instead.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // These bytes are attacker-influenced in principle (they're whatever
      // was uploaded), so pin the declared type and forbid sniffing rather
      // than let a browser reinterpret a .png as something active.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
