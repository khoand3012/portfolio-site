// src/lib/galleryMediaTypes.ts
//
// The allow-list for GALLERY uploads — images and video bound for R2. The
// avatar's list lives separately in mediaTypes.ts: it is images-only, capped
// at 5MB, and its bytes are served back from this site's own origin, so the
// two lists answer different questions and deliberately don't share a module.
//
// As there, the stored object's extension is derived from the validated
// content type rather than taken from anything the client sends. The
// media-upload spec originally threaded a client-supplied `X-File-Extension`
// header through the route; for a six-entry allow-list that indirection buys
// nothing and adds a value that must itself be validated.

/**
 * **SVG is deliberately absent**, for the same reason it is absent from the
 * avatar list: an SVG is an active document that can carry <script>.
 *
 * **QuickTime (.mov) is deliberately absent too**, for a different reason —
 * it is not a security risk, it simply does not play reliably across
 * browsers. An iPhone recording has to be converted before upload rather
 * than silently becoming a tile that only plays on Safari.
 */
export const GALLERY_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** 20MB — a generous full-resolution photo. */
export const MAX_GALLERY_IMAGE_BYTES = 20 * 1024 * 1024;
/** 100MB — a few minutes of 1080p, and small enough to stay inside a
 *  serverless function's memory and timeout budget while it forwards. */
export const MAX_GALLERY_VIDEO_BYTES = 100 * 1024 * 1024;

/** Strips parameters (`video/mp4; codecs=…`) and normalizes case — both are
 *  legal in a Content-Type header. */
function baseType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function galleryExtensionForType(contentType: string): string | null {
  return GALLERY_TYPES[baseType(contentType)] ?? null;
}

/**
 * The cap that applies to this type, or `null` for a type that isn't allowed
 * at all. Returning `null` rather than a default matters: the route asks for
 * the cap before it decides whether to read the body, and a disallowed type
 * falling through to the video cap would be the wrong kind of permissive.
 */
export function maxBytesForType(contentType: string): number | null {
  const base = baseType(contentType);
  if (!GALLERY_TYPES[base]) return null;
  return base.startsWith('video/')
    ? MAX_GALLERY_VIDEO_BYTES
    : MAX_GALLERY_IMAGE_BYTES;
}

/**
 * Whether a URL is a VIDEO this app itself stored.
 *
 * This is how an upload can flip `Video.mode` to `'embed'` without breaking
 * the rule in Video.tsx that mode is a stored choice, never sniffed. The
 * question asked here is not "does this URL look like a video?" — it is "is
 * this one of our own generated object keys?", which is answerable exactly
 * because we generate them: `<uuid>.<ext>` under `media/` (R2) or
 * `/api/media/` (the local-dev fallback). A pasted YouTube link can't match,
 * and neither can someone else's `holiday.mp4`.
 */
const UPLOADED_VIDEO_KEY =
  /\/(?:media|api\/media)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/i;

export function isUploadedVideoUrl(url: string): boolean {
  if (!url) return false;
  // Relative values (the local-dev fallback) never parse as absolute URLs,
  // so match the raw string rather than reaching for `new URL`.
  return UPLOADED_VIDEO_KEY.test(url);
}
