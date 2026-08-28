# Design: Real image/video upload for the gallery-item admin field

Status: draft, awaiting review
Date: 2026-08-28

## Why

`GalleryItem`'s `image`/`videoUrl` fields in `puck.config.tsx` are plain
`{ type: 'text' }` inputs today — the site owner can only paste an
already-hosted URL, there's no way to upload a file from the admin panel.
The site owner wants real upload support, for both images and video, while
keeping the paste-a-URL path available too (some media, e.g. an existing
YouTube link, should stay a link rather than a re-hosted file).

This requires a new capability the app doesn't have at all yet: storing and
serving binary media. The existing Netlify Blobs store holds the site's JSON
content and isn't a fit for this — it's not a public CDN, and mixing binary
media through the same JSON-shaped read/write path (`blobStore.ts`,
`portfolioContent.ts`) would conflate two different storage needs. This spec
adds a second, separate storage backend for media, alongside the existing
one for content.

## Scope

In scope:
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
- A new custom Puck field (`type: 'custom'`) for `GalleryItem.image` and
  `GalleryItem.videoUrl`, replacing the plain text fields, offering both a
  "paste a URL" input and a file picker that uploads through the new route
  and fills the field with the resulting public R2 URL.
- A new `caption` field on `GalleryItem` (site owner's term: "subtext for
  the description of that media") — a plain string, threaded through
  `src/types.ts`, `puck.config.tsx`, `puckAdapter.ts`,
  `app/admin/actions.ts`'s `assertBlocksShape`, and rendered in
  `GalleryTile.tsx`.
- Upload progress surfaced as a toast, updated in place via the `update()`
  handle the existing `toast()` call already returns
  (`src/lib/use-toast.ts`) — no new UI component needed for this.

Out of scope:
- Direct-to-R2 presigned uploads (explicitly decided against — everything
  proxies through the app's own server).
- WebSocket-based progress tracking — Netlify Functions do not support
  WebSockets at all (a hard architectural constraint of the serverless
  execution model, not a config limitation); progress is relayed over a
  streamed HTTP response on the same upload request instead.
- Video transcoding, thumbnailing, or adaptive-bitrate delivery. Uploaded
  files are stored and served as-is.
- Cleaning up orphaned R2 objects when a gallery item's media is replaced or
  the item is deleted. Accepted gap for now, in the same spirit as this
  codebase's existing unbounded content-history-snapshot growth — revisit
  only if storage cost becomes a real problem.
- Redesigning any block type other than `gallery-item`.

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

### Puck field (custom upload-or-paste field)

`puck.config.tsx`'s `GalleryItem.image`/`videoUrl` fields change from
`{ type: 'text' }` to `{ type: 'custom', render: ... }` (Puck's custom field
API — `render({ value, onChange, name, field, id })` — confirmed against
`https://puckeditor.com/docs/api-reference/fields/custom.md`). The rendered
component offers a text input (paste URL, calls `onChange` directly) and a
file picker + upload button, side by side.

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

### Caption field

`src/types.ts`'s `GalleryItemBlock` gains `caption?: string`.
`puck.config.tsx` gains a plain `{ type: 'text' }` field for it.
`puckAdapter.ts`'s `blockToComponentData`/`puckDataToBlocks` pass it through
like any other optional string field (same pattern as `Job.role` or
`Education.dissertation`). `app/admin/actions.ts`'s `assertBlocksShape` gains
an `assertOptionalString(record.caption, label, 'caption')` check, matching
the pattern already used for `image`/`videoUrl`. `GalleryTile.tsx` renders it
as a caption line under the tile when present.

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
- Extend `puckAdapter.test.ts`'s round-trip fidelity test and
  `app/admin/actions.test.ts`'s shape-guard tests to cover the new
  `caption` field.
- Manual verification in a browser: upload an image and a short video
  through the real admin panel, confirm the progress toast updates through
  both legs, confirm the resulting public page renders the uploaded media
  and caption, and confirm pasting a URL directly still works as the
  alternative path.

## Open questions for implementation planning (not blocking this spec)

- Exact max file size cap and the precise accepted MIME allow-list. Proposed
  default: images up to 20MB, video up to 500MB — needs the site owner's
  confirmation/adjustment at implementation time.
- `r2.dev` vs. a custom domain for the public bucket URL — the site owner's
  call at bucket-provisioning time (walked through separately in
  conversation, not repeated here).
- Orphaned-object cleanup (see "Out of scope") — revisit only if it becomes
  a real cost problem, consistent with how this repo already treats the
  unbounded content-history-snapshot growth.
