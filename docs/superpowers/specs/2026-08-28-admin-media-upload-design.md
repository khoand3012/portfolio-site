# Design: Real image/video upload for the media admin fields

Status: draft, awaiting review
Date: 2026-08-28 (revised 2026-09-05)

## Why

The media URL fields in `puck.config.tsx` are plain `{ type: 'text' }` inputs
— the site owner can only paste an already-hosted URL, there's no way to
upload a file from the admin panel. The site owner wants real upload support,
for both images and video, while keeping the paste-a-URL path available too
(some media, e.g. an existing YouTube link, should stay a link rather than a
re-hosted file).

This requires a new capability the app doesn't have at all yet: storing and
serving binary media. The existing Netlify Blobs store holds the site's JSON
content and isn't a fit for this — it's not a public CDN, and mixing binary
media through the same JSON-shaped read/write path (`blobStore.ts`,
`portfolioContent.ts`) would conflate two different storage needs. This spec
adds a second, separate storage backend for media, alongside the existing
one for content.

## Relationship to the content-structure spec

This spec **depends on**
`docs/superpowers/specs/2026-08-28-content-structure-and-hero-editing-design.md`
and should land after its phase A. That spec replaces the old
`gallery-item` block with two separate blocks:

```ts
export interface ImageBlock {
  type: 'image';
  src?: string;
  alt?: string;
  caption?: string;
}

export interface VideoBlock {
  type: 'video';
  mode: 'embed' | 'link';
  url?: string;
  poster?: string;
  caption?: string;
}
```

So this spec's upload field attaches to three fields — `Image.src`,
`Video.url`, and `Video.poster` — rather than to one block's
`image`/`videoUrl` pair. Everything else here (the R2 bucket, the route
handler, the auth gate, the streamed progress protocol, the client XHR flow)
is unaffected by that change.

Captions are **not** part of this spec any more: `caption` is a first-class
field on both `ImageBlock` and `VideoBlock` in the content-structure spec,
threaded through the types, Puck config, adapter, shape guard, and rendering
there. Nothing about captions is left for this spec to add.

If for some reason this spec lands first, against the current
`GalleryItemBlock`, the bindings are `GalleryItem.image` and
`GalleryItem.videoUrl` and a `caption` field has to be added here — but that
is the awkward order, and the content-structure work is the larger of the
two.

## Scope

- A new Cloudflare R2 bucket (S3-compatible object storage) for uploaded
  media, entirely separate from the Netlify Blobs content store.
- A new `app/api/upload/route.ts` Route Handler — deliberately a Route
  Handler, not a Server Action, because Next.js Server Actions enforce their
  own framework-level default body size limit of 1MB
  (`node_modules/next/dist/server/app-render/action-handler.js`,
  `defaultBodySizeLimit`), independent of any hosting platform. Route
  Handlers have no equivalent built-in cap.
- Session + allow-list authorization on that route, checked the same way as
  `/api/puck` (`await auth()`, then `isAllowedEmail(...)`, 403 before any
  file processing) — not just relying on `/admin`'s middleware gate, for the
  same defense-in-depth reasoning already established for `/api/puck` and
  `saveTabBlocksAction`.
- Proxy-through-server upload: the browser sends the file to
  `app/api/upload/route.ts`, which forwards it to R2. No direct-to-R2
  presigned upload.
- A new custom Puck field (`type: 'custom'`) replacing the plain text inputs
  on `Image.src`, `Video.url`, and `Video.poster`, offering both a "paste a
  URL" input and a file picker that uploads through the new route and fills
  the field with the resulting public R2 URL.
- Upload progress surfaced as a toast, updated in place via the `update()`
  handle the existing `toast()` call already returns
  (`src/lib/use-toast.ts`) — no new UI component needed for this.

## Architecture

### Storage (Cloudflare R2)

A new R2 bucket, provisioned by the site owner directly in their Cloudflare
account (same "site owner provisions the credential, code just wires it in"
pattern this repo already uses for Google OAuth and Puck Cloud). Public
access is either R2's `r2.dev` development URL or a custom domain — the site
owner's choice, made at provisioning time; the code only needs the resulting
public base URL.

New env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_PUBLIC_URL`. The S3-compatible API endpoint
(`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`) is derived from
`R2_ACCOUNT_ID`, not a separate var.

New dependencies: `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` (the
latter's `Upload` helper is what emits `httpUploadProgress` events during
the R2-forwarding leg, described below).

New module `src/lib/mediaStore.ts`, mirroring `blobStore.ts`'s shape: a
small wrapper around the S3 client so route-handler code doesn't deal with
SDK specifics directly. Exposes something like
`uploadMedia(key, body, contentType, onProgress) => Promise<{ url }>`.

### Upload route (`app/api/upload/route.ts`)

1. `await auth()`, then `isAllowedEmail(session?.user?.email,
   process.env.ALLOWED_EMAILS)` — 403 immediately if it fails, before
   touching the request body at all.
2. Validate `Content-Type` against an allow-list (`image/*`, `video/*`) and
   reject anything else with 400. Validate a size cap (default proposed
   below; see open questions) before starting the R2 upload.
3. The request body is the raw file bytes (not `multipart/form-data`) — the
   standard `Content-Type` header carries the MIME type, and a new
   `X-File-Extension` request header (client-supplied, validated
   server-side against the same content-type allow-list — e.g. rejecting an
   `X-File-Extension: exe` on an `image/png` request) carries just the
   extension to use for the stored object. This is specifically so the
   route handler can pass `request.body` straight through as a stream to
   `mediaStore.uploadMedia` without buffering the whole file first to parse
   a multipart form, and so the R2 object key never incorporates a
   user-supplied filename verbatim (which could otherwise carry path
   traversal characters or collide with an existing key).
4. `mediaStore.uploadMedia` generates the object key itself as
   `media/<uuid>.<extension>` (a fresh random UUID per upload, via
   `node:crypto`'s `randomUUID()`) — never the original filename — then
   wraps the write in `@aws-sdk/lib-storage`'s `Upload`, listening to
   `httpUploadProgress`.
5. The route handler returns a **streamed** `Response` (Netlify's
   `@netlify/plugin-nextjs`-generated handler uses the modern, Web-standard
   Functions API — confirmed by reading
   `node_modules/@netlify/plugin-nextjs/dist/build/templates/handler.tmpl.js`,
   which exports a `(req: Request, context)` handler rather than the older
   Lambda-compatible event/callback signature — so a streamed body is a
   supported, native fit here, not a workaround). The stream emits
   newline-delimited JSON events: `{"type":"progress","loaded":N,"total":N}`
   while the R2 upload is in flight, then a final
   `{"type":"done","url":"..."}` or `{"type":"error","message":"..."}`.

The route's content-type allow-list is the authoritative one. The client-side
`accept` described below is a convenience for the file picker, not a
security boundary — a request that bypasses the UI is still rejected here.

### Puck field (custom upload-or-paste field)

The three media URL fields change from `{ type: 'text' }` to
`{ type: 'custom', render: ... }` (Puck's custom field API —
`render({ value, onChange, name, field, id })` — confirmed against
`https://puckeditor.com/docs/api-reference/fields/custom.md`). The rendered
component offers a text input (paste URL, calls `onChange` directly) and a
file picker + upload button, side by side.

Because the same field appears on three props that accept different media,
it is defined once as a small factory in `puck.config.tsx` rather than
copy-pasted three times:

```tsx
const mediaField = (accept: 'image' | 'video') => ({
  type: 'custom' as const,
  render: ({ value, onChange }) => (
    <MediaUploadField accept={accept} value={value} onChange={onChange} />
  ),
});

// Image:  { src: mediaField('image'), … }
// Video:  { url: mediaField('video'), poster: mediaField('image'), … }
```

`accept` drives the file picker's `accept` attribute (`image/*` or `video/*`)
and the size cap the client warns about before starting an upload. The
component itself lives in `src/components/MediaUploadField.tsx` — a client
component, kept out of `puck.config.tsx` so the config file stays a config
file.

**Uploading a file should flip `Video.mode` to `embed`.** The content-structure
spec gives `Video` an explicit `mode: 'embed' | 'link'` toggle defaulting to
`link`, because a pasted YouTube URL cannot play in a `<video>` element. An
uploaded R2 file is the one case where the right answer is knowable: it is a
direct media file, so a successful upload into `Video.url` also sets
`mode: 'embed'`. Puck's custom-field `onChange` can only write its own prop,
so this is a two-prop update and needs the `MediaUploadField` to receive an
optional `onUploaded` callback that the `Video` field config wires to the
mode prop — or, if that proves awkward against Puck's field API, the upload
leaves `mode` alone and the field's help text tells the owner to switch it.
Settle which at implementation time; the fallback is acceptable, the
automatic version is nicer. Pasting a URL never changes `mode`, since a
pasted URL may be either kind.

Client-side upload flow, on file selection:
1. A single `XMLHttpRequest` (not `fetch` — `fetch` doesn't expose upload
   progress the way `xhr.upload.onprogress` does) `POST`s the raw file to
   `/api/upload`.
2. `xhr.upload.onprogress` drives the toast during the browser→server leg.
3. `xhr.onprogress` (tracking `xhr.responseText`'s growing length as the
   streamed response arrives) parses newline-delimited JSON events out of
   the growing response text, driving the same toast (via its `update()`
   handle) during the server→R2 leg with the `{loaded, total}` values from
   step 5 above.
4. On `{"type":"done","url":...}`, the field's `onChange(url)` fires,
   filling in the field with the new R2 URL, and the toast is updated to a
   final "Uploaded." state.
5. On `{"type":"error",...}` or an XHR network error/abort, the toast
   becomes a destructive "Upload failed" with the error message; the
   field's value is left unchanged.

### What this spec does not touch

`src/types.ts`, `src/lib/puckAdapter.ts`, `src/lib/puckTypes.ts`, and
`assertBlocksShape` need no changes here. `Image.src`, `Video.url`, and
`Video.poster` are already optional strings in the content-structure spec's
model, already round-trip through the adapter, and are already validated by
`assertOptionalString` — a URL produced by an upload is the same kind of
value as a URL that was pasted. This spec changes only how that string gets
into the field.

The public-page rendering of those URLs is likewise unchanged, including the
existing `isSafeHttpUrl` gate that both `Image` and `Video` carry over from
`GalleryTile.tsx`.

## Error handling

- Unauthorized request → 403 before any file processing, matching the
  existing `/api/puck` and `saveTabBlocksAction` pattern.
- Wrong content type or over the size cap → 400, rejected before any R2
  call.
- An R2 upload failure mid-stream → an `{"type":"error",...}` event in the
  response stream; the client shows a destructive toast; the Puck field's
  value is not touched.
- A network interruption during upload → the XHR's `onerror`/`onabort`
  handlers surface a destructive toast the same way.

## Testing / verification plan

- `src/lib/mediaStore.test.ts`: mock the S3 client (same mocking style as
  `blobStore.test.ts`'s "real Blobs, mocked" tests) — verify correct key
  construction, content-type passthrough, and that an S3-client error
  propagates rather than being swallowed.
- `app/api/upload/route.test.ts`: verify the auth gate rejects a
  non-allow-listed session (403) before calling `mediaStore`, and that an
  invalid content-type/oversized request is rejected (400) before calling
  `mediaStore`, mirroring `app/admin/actions.test.ts`'s mocking patterns.
  Include the `X-File-Extension` mismatch case (an `exe` extension on an
  `image/png` request) — the header is client-supplied and its validation is
  the whole reason it's safe to use in the object key.
- `src/components/MediaUploadField.test.tsx`: a `done` event calls
  `onChange` with the returned URL; an `error` event leaves the value
  unchanged; the `accept` prop reaches the file input.
- Manual verification in a browser: upload an image into an `Image` block
  and a short video into a `Video` block through the real admin panel,
  confirm the progress toast updates through both legs, confirm the
  resulting public page renders the uploaded media, and confirm pasting a
  URL directly still works as the alternative path on all three fields.

## Open questions for implementation planning (not blocking this spec)

- Exact max file size cap and the precise accepted MIME allow-list. Proposed
  default: images up to 20MB, video up to 500MB — needs the site owner's
  confirmation/adjustment at implementation time.
- `r2.dev` vs. a custom domain for the public bucket URL — the site owner's
  call at bucket-provisioning time (walked through separately in
  conversation, not repeated here).
- Orphaned R2 objects aren't cleaned up when a block's media is replaced or
  the block is deleted — revisit only if it becomes a real cost problem,
  consistent with how this repo already treats the unbounded
  content-history-snapshot growth.
