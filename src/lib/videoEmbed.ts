// src/lib/videoEmbed.ts
//
// Turns a link-mode VideoBlock URL into something the public page's lightbox
// can put in an <iframe>.
//
// This does NOT contradict the "mode is an explicit stored choice, not sniffed
// from the URL" rule in Video.tsx. `mode` still decides the only thing it ever
// decided: whether the URL names a video FILE (embed) or a PAGE (link). This
// module only asks which provider an already-declared link points at, so the
// page can play it inline instead of navigating away.
//
// The security property that matters: the returned `embedUrl` is BUILT from a
// validated id, never carried over from the input. An owner-supplied URL can
// therefore never reach an iframe `src` verbatim, whatever it contains.

export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  /** Constructed by this module — safe to use as an iframe src. */
  embedUrl: string;
  /**
   * A poster to show on the grid tile when the block carries no `poster` of
   * its own. YouTube exposes one at a predictable URL; Vimeo does not without
   * an API call, so a Vimeo embed leaves this undefined.
   */
  thumbnailUrl?: string;
}

// Exact hostnames, never a suffix match: `endsWith('youtube.com')` would also
// accept `notyoutube.com`, which an attacker can register.
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** YouTube ids are exactly 11 characters from the URL-safe base64 alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

/** Path prefixes that carry the id in the segment straight after them. */
const YOUTUBE_ID_PREFIXES = ['embed', 'shorts', 'live', 'v'];

function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function youtubeId(url: URL): string | null {
  const parts = segments(url);

  // youtu.be/<id> — the whole path is the id.
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    return parts[0] ?? null;
  }

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  if (parts.length >= 2 && YOUTUBE_ID_PREFIXES.includes(parts[0] as string)) {
    return parts[1] as string;
  }

  // /watch?v=<id>
  return url.searchParams.get('v');
}

function vimeoId(url: URL): string | null {
  const parts = segments(url);

  // player.vimeo.com/video/<id>
  if (parts[0] === 'video') {
    return parts[1] ?? null;
  }

  // vimeo.com/<id>
  return parts[0] ?? null;
}

export function parseVideoEmbed(url: string): VideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // A `javascript:` value can carry an allowed host in its text; only http(s)
  // ever reaches the host check below.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const id = youtubeId(parsed);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (VIMEO_HOSTS.has(parsed.hostname)) {
    const id = vimeoId(parsed);
    if (!id || !VIMEO_ID.test(id)) return null;
    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${id}`,
    };
  }

  return null;
}
