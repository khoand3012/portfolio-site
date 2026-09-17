/**
 * The allow-list of avatar image types, and the file extension each one is
 * stored under.
 *
 * The extension is derived from the (validated) content type rather than
 * taken from the uploaded filename. The media-upload spec threaded a
 * client-supplied `X-File-Extension` header through the route because it had
 * to support arbitrary video containers; for a four-entry image allow-list
 * that indirection buys nothing and adds a value that must itself be
 * validated. Nothing user-supplied reaches the stored object key.
 *
 * **SVG is deliberately absent.** An SVG is an active document — it can
 * carry <script> — and these bytes are served back from this site's own
 * origin by app/api/media, so an uploaded SVG would be stored XSS against
 * the site owner's own session. The other four are inert raster formats.
 */
export const AVATAR_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 5MB. Generous for an avatar that renders into a 114px circle. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function extensionForType(contentType: string): string | null {
  // Strip any parameters (`image/jpeg; charset=…`) and normalize case before
  // matching — both are legal in a Content-Type header.
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return AVATAR_TYPES[base] ?? null;
}
