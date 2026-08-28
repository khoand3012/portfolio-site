# Admin Media Upload (R2-backed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the site owner upload actual image/video files from the `/admin` panel's gallery-item block (not just paste an already-hosted URL), storing them in a new Cloudflare R2 bucket.

**Architecture:** A new `src/lib/mediaStore.ts` wraps R2 (S3-compatible object storage) behind a small interface, mirroring `blobStore.ts`'s shape but for binary media instead of JSON content. A new `app/api/upload/route.ts` Route Handler (not a Server Action — see Global Constraints) receives the raw file bytes from the browser, forwards them to R2 via `@aws-sdk/lib-storage`'s `Upload` helper, and streams newline-delimited JSON progress events back on the same response. A new custom Puck field (`src/components/MediaField.tsx`) replaces the plain-text `image`/`videoUrl` fields, offering both a paste-URL input and a file-upload button whose progress drives the existing toast system. A new `caption` field is added to the block model alongside this.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` (S3-compatible client for Cloudflare R2), Next.js Route Handlers, the existing `@puckeditor/core` custom field API, the existing `src/lib/use-toast.ts` toast system.

**Spec:** `docs/superpowers/specs/2026-08-28-admin-media-upload-design.md`

## Global Constraints

- Route Handler, not a Server Action: Next.js Server Actions enforce a framework-level default body size limit of 1MB (`node_modules/next/dist/server/app-render/action-handler.js`'s `defaultBodySizeLimit`), independent of hosting platform. `app/api/upload/route.ts` must be a plain Route Handler to avoid this.
- Every new server-side route must check `await auth()` + `isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)` and reject with a non-2xx response before doing any real work — the same defense-in-depth rule already applied to `/api/puck`, `app/admin/page.tsx`, and `saveTabBlocksAction`. Don't rely on `middleware.ts` alone.
- `.env` is off-limits to view/edit/delete by an agent (existing project rule) — whenever a task needs a new env var, tell the user its name and how to obtain the value; do not touch `.env` directly. New vars this plan introduces: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- R2 object keys are always server-generated (`media/<uuid>.<extension>` via `node:crypto`'s `randomUUID()`), never a user-supplied filename — this avoids both path-traversal characters and key collisions.
- No file size cap or MIME allow-list bypass: reject anything outside `image/*`/`video/*` and over the configured size cap before any R2 call, not just at the UI layer.
- Package versions below are floors (`^` ranges) — `npm install` will resolve current compatible versions.
- Design tokens are fixed (existing repo rule): any new CSS must reuse the existing `--navy-*`/`--graphite-*`/`--mint-*`/semantic tokens in `src/styles/global.css`, never introduce new colors.

---

### Task 1: `caption` field on the gallery-item block

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/puckTypes.ts`
- Modify: `puck.config.tsx`
- Modify: `src/lib/puckAdapter.ts`
- Modify: `app/admin/actions.ts`
- Modify: `src/components/GalleryTile.tsx`
- Modify: `src/styles/global.css`
- Test: `src/components/GalleryTile.test.tsx`
- Test: `src/lib/puckAdapter.test.ts`
- Test: `app/admin/actions.test.ts`

**Interfaces:**
- Produces: `GalleryItemBlock.caption?: string` (in `src/types.ts`) — Task 5's `MediaField`/puck config work does not touch this field, but must not break it.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/GalleryTile.test.tsx` (new `it` block, keep all existing ones):

```tsx
it('renders a caption when one is present', () => {
  const { container } = render(
    <GalleryTile
      item={{
        type: 'gallery-item',
        itemType: 'photo',
        image: 'https://example.com/p.jpg',
        caption: 'A conference talk in 2024',
      }}
    />,
  );
  expect(
    within(container).getByText('A conference talk in 2024'),
  ).toBeInTheDocument();
});

it('renders no caption element when caption is absent', () => {
  const { container } = render(
    <GalleryTile
      item={{
        type: 'gallery-item',
        itemType: 'photo',
        image: 'https://example.com/p.jpg',
      }}
    />,
  );
  expect(container.querySelector('.gallery-caption')).not.toBeInTheDocument();
});
```

Add a `caption` value to one block in `src/lib/puckAdapter.test.ts`'s round-trip test array (the `gallery-item` entry):

```ts
{
  type: 'gallery-item',
  itemType: 'photo',
  image: 'https://example.com/p.jpg',
  caption: 'A conference talk in 2024',
},
```

Add to `app/admin/actions.test.ts` (new `it`, alongside the existing gallery-item test):

```ts
it('rejects a gallery-item block whose caption is not a string', async () => {
  await expect(
    saveTabBlocksAction('teaching', [
      {
        type: 'gallery-item',
        itemType: 'photo',
        caption: 42,
      } as unknown as never,
    ]),
  ).rejects.toThrow('non-string caption');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test`
Expected: the three new tests FAIL — `caption` doesn't exist on `GalleryItemBlock` yet (a type error surfaces via `npm run check` too, but Vitest will fail at runtime since the caption text/behavior isn't implemented).

- [ ] **Step 3: Add `caption` to the type**

In `src/types.ts`, `GalleryItemBlock`:

```ts
export interface GalleryItemBlock {
  type: 'gallery-item';
  itemType: GalleryItemType;
  image?: string;
  videoUrl?: string;
  caption?: string;
}
```

- [ ] **Step 4: Add `caption` to Puck's shared prop type**

In `src/lib/puckTypes.ts`, `PuckComponentProps.GalleryItem`:

```ts
GalleryItem: {
  itemType: 'photo' | 'video';
  image: string;
  videoUrl: string;
  caption: string;
};
```

- [ ] **Step 5: Add the field to `puck.config.tsx`**

In the `GalleryItem` component config:

```tsx
GalleryItem: {
  fields: {
    itemType: {
      type: 'select',
      options: [
        { label: 'Photo', value: 'photo' },
        { label: 'Video', value: 'video' },
      ],
    },
    image: { type: 'text' },
    videoUrl: { type: 'text' },
    caption: { type: 'text' },
  },
  defaultProps: { itemType: 'photo', image: '', videoUrl: '', caption: '' },
  render: (props) => (
    <GalleryTile
      item={{
        type: 'gallery-item',
        itemType: props.itemType,
        image: props.image || undefined,
        videoUrl: props.videoUrl || undefined,
        caption: props.caption || undefined,
      }}
    />
  ),
},
```

(Task 5 changes `image`/`videoUrl`'s `{ type: 'text' }` to `{ type: 'custom', ... }` — leave them as plain text fields for now, this task is caption-only.)

- [ ] **Step 6: Thread `caption` through `puckAdapter.ts`**

In `blockToComponentData`'s `'gallery-item'` case:

```ts
case 'gallery-item':
  return {
    type: 'GalleryItem',
    props: {
      id,
      itemType: block.itemType,
      image: block.image ?? '',
      videoUrl: block.videoUrl ?? '',
      caption: block.caption ?? '',
    },
  };
```

In `puckDataToBlocks`'s `'GalleryItem'` case:

```ts
case 'GalleryItem':
  return {
    type: 'gallery-item',
    itemType: props.itemType,
    image: props.image || undefined,
    videoUrl: props.videoUrl || undefined,
    caption: props.caption || undefined,
  };
```

- [ ] **Step 7: Validate `caption` in `app/admin/actions.ts`**

In `assertBlocksShape`'s `'gallery-item'` case, after the existing `assertOptionalString` calls for `image`/`videoUrl`:

```ts
assertOptionalString(record.caption, label, 'caption');
```

- [ ] **Step 8: Render the caption in `GalleryTile.tsx`, without breaking the gallery grid**

`global.css`'s `.gallery-grid` is a CSS grid whose direct children are sized by `.gallery-tile`'s `aspect-ratio: 4 / 3` (`src/styles/global.css:362-390`). Adding a caption directly inside `.gallery-tile` would either get clipped by that fixed aspect ratio or stretch it, and `GalleryTile` currently returns three different top-level elements (`<a>` for a linked video, `<div>` for a placeholder or a photo) — so a caption can't just be appended once at the end. Introduce a new outer wrapper, `.gallery-item`, that becomes the actual grid child instead of `.gallery-tile`; `.gallery-tile`'s own CSS is untouched, so the box itself looks byte-identical to before.

Replace the whole body of `src/components/GalleryTile.tsx` with:

```tsx
import type { GalleryItemBlock } from '../types';

interface Props {
  item: GalleryItemBlock;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
const PHOTO_ICON_PATHS =
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
const VIDEO_ICON_PATHS =
  '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function VideoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
      dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
    />
  );
}

export function GalleryTile({ item }: Props) {
  let tile: React.ReactNode;

  if (item.itemType === 'video') {
    if (item.videoUrl && isSafeHttpUrl(item.videoUrl)) {
      tile = (
        <a
          className="gallery-tile"
          href={item.videoUrl}
          target="_blank"
          rel="noopener"
          style={{ textDecoration: 'none' }}
        >
          {item.image ? (
            // biome-ignore lint/performance/noImgElement: item.image is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this lint pass.
            <img
              src={item.image}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
              }}
            />
          ) : (
            <>
              <VideoIcon />
              <span>Watch video</span>
            </>
          )}
        </a>
      );
    } else {
      tile = (
        <div className="gallery-tile">
          <VideoIcon />+ Add video
        </div>
      );
    }
  } else if (item.image) {
    tile = (
      <div className="gallery-tile" style={{ padding: 0, overflow: 'hidden' }}>
        {/* biome-ignore lint/performance/noImgElement: item.image is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this lint pass. */}
        <img
          src={item.image}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  } else {
    tile = (
      <div className="gallery-tile">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
          dangerouslySetInnerHTML={{ __html: PHOTO_ICON_PATHS }}
        />
        + Add photo
      </div>
    );
  }

  return (
    <div className="gallery-item">
      {tile}
      {item.caption && <p className="gallery-caption">{item.caption}</p>}
    </div>
  );
}
```

(This also deduplicates the video-icon SVG, which previously appeared twice with identical markup — a small, in-scope cleanup since the file is being rewritten anyway, not a separate unrelated refactor.)

- [ ] **Step 9: Update `app/page.tsx`'s gallery-grid class target**

Read `app/page.tsx` around its `wrapperClassName: t.key === 'media' ? 'gallery-grid' : undefined` line — no change needed there; `.gallery-grid`'s CSS only cares that its direct children are `.gallery-item` elements sized by their content, which is now true regardless of which tile variant renders inside. Confirm this by reading the file, don't skip this step just because no edit is expected — the point is to verify the assumption, not to blindly trust it.

- [ ] **Step 10: Add `.gallery-item`/`.gallery-caption` CSS**

In `src/styles/global.css`, right after the existing `.gallery-tile svg` rule (around line 390):

```css
.gallery-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
.gallery-caption {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npm run test`
Expected: all tests pass, including the three new ones from Step 1.

- [ ] **Step 12: Full check**

Run: `npm run check && npm run lint`
Expected: both clean.

- [ ] **Step 13: Commit**

```bash
git add src/types.ts src/lib/puckTypes.ts puck.config.tsx src/lib/puckAdapter.ts app/admin/actions.ts src/components/GalleryTile.tsx src/styles/global.css src/components/GalleryTile.test.tsx src/lib/puckAdapter.test.ts app/admin/actions.test.ts
git commit -m "Add a caption field to the gallery-item block"
```

---

### Task 2: Cloudflare R2 setup + `mediaStore.ts`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/mediaStore.ts`
- Test: `src/lib/mediaStore.test.ts`

**Interfaces:**
- Produces: `getMediaStore(): MediaStore` where `MediaStore = { upload(body: Readable, options: { contentType: string; extension: string; onProgress?: (p: { loaded: number; total: number }) => void }): Promise<{ url: string }> }` — Task 3's route handler is the only consumer.

- [ ] **Step 1: Tell the user what to provision (do not touch `.env` yourself)**

Before writing any code, tell the user to create the R2 bucket and API token per the walkthrough already agreed on, and to set these five env vars — in their local `.env`/`.env.local` for `next dev`, and in Netlify's site settings for production:

| Var | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Their Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | From the R2 API token |
| `R2_SECRET_ACCESS_KEY` | From the R2 API token |
| `R2_BUCKET_NAME` | The bucket name they created |
| `R2_PUBLIC_URL` | The `r2.dev` URL or custom domain they enabled, no trailing slash |

Do not proceed to Step 2 until the user confirms these are set (at least locally, so Step 8's test run and Task 4's manual verification can use real credentials).

- [ ] **Step 2: Install the S3-compatible SDK**

```bash
npm install @aws-sdk/client-s3@^3 @aws-sdk/lib-storage@^3
```

- [ ] **Step 3: Write the failing tests**

Create `src/lib/mediaStore.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation((config: unknown) => ({ config })),
}));

interface FakeUploadParams {
  Bucket: string;
  Key: string;
  Body: unknown;
  ContentType: string;
}

let lastUploadParams: FakeUploadParams | undefined;
let lastUploadInstance: FakeUpload | undefined;
let shouldFail = false;

class FakeUpload extends EventEmitter {
  constructor({ params }: { params: FakeUploadParams }) {
    super();
    lastUploadParams = params;
    lastUploadInstance = this;
  }
  done() {
    return shouldFail
      ? Promise.reject(new Error('R2 is down'))
      : Promise.resolve({});
  }
}

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation((opts: { params: FakeUploadParams }) => new FakeUpload(opts)),
}));

const ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_BUCKET_NAME: 'my-bucket',
  R2_PUBLIC_URL: 'https://media.example.com',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
};

describe('mediaStore', () => {
  beforeEach(() => {
    vi.resetModules();
    shouldFail = false;
    lastUploadParams = undefined;
    lastUploadInstance = undefined;
    for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  });

  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  it('uploads with a random-uuid key under media/ and returns the public URL', async () => {
    const { getMediaStore } = await import('./mediaStore');
    const store = getMediaStore();
    const { url } = await store.upload('fake-body' as never, {
      contentType: 'image/png',
      extension: 'png',
    });
    // biome-ignore lint/style/noNonNullAssertion: set synchronously by store.upload above.
    const params = lastUploadParams!;
    expect(params.Bucket).toBe('my-bucket');
    expect(params.Body).toBe('fake-body');
    expect(params.ContentType).toBe('image/png');
    expect(params.Key).toMatch(/^media\/[0-9a-f-]{36}\.png$/);
    expect(url).toBe(`https://media.example.com/${params.Key}`);
  });

  it('forwards httpUploadProgress events to onProgress', async () => {
    const { getMediaStore } = await import('./mediaStore');
    const store = getMediaStore();
    const onProgress = vi.fn();
    const uploadPromise = store.upload('fake-body' as never, {
      contentType: 'image/png',
      extension: 'png',
      onProgress,
    });
    // Synchronous emit, before `uploadPromise` settles — `store.upload`
    // registers the `httpUploadProgress` listener before its first
    // `await`, so this fires while the listener is already attached but
    // the fake `.done()` promise hasn't resolved yet.
    lastUploadInstance?.emit('httpUploadProgress', { loaded: 50, total: 100 });
    await uploadPromise;
    expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 100 });
  });

  it('throws a clear error when a required env var is missing', async () => {
    delete process.env.R2_BUCKET_NAME;
    const { getMediaStore } = await import('./mediaStore');
    expect(() => getMediaStore()).toThrow('R2_BUCKET_NAME');
  });

  it('propagates an upload failure rather than swallowing it', async () => {
    shouldFail = true;
    const { getMediaStore } = await import('./mediaStore');
    const store = getMediaStore();
    await expect(
      store.upload('fake-body' as never, {
        contentType: 'image/png',
        extension: 'png',
      }),
    ).rejects.toThrow('R2 is down');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test -- mediaStore`
Expected: FAIL — `./mediaStore` doesn't exist yet.

- [ ] **Step 5: Implement `src/lib/mediaStore.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  contentType: string;
  extension: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface MediaStore {
  upload(body: Readable, options: UploadOptions): Promise<{ url: string }>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Factory function, not a module-level singleton — mirrors
// blobStore.ts's getContentStore(name), and lets tests reset env vars and
// re-import the module between cases without leaking client state.
export function getMediaStore(): MediaStore {
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  const bucket = requiredEnv('R2_BUCKET_NAME');
  const publicUrl = requiredEnv('R2_PUBLIC_URL').replace(/\/$/, '');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });

  return {
    async upload(body, { contentType, extension, onProgress }) {
      const key = `media/${randomUUID()}.${extension}`;
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
      });
      if (onProgress) {
        upload.on('httpUploadProgress', (progress) => {
          onProgress({
            loaded: progress.loaded ?? 0,
            total: progress.total ?? 0,
          });
        });
      }
      await upload.done();
      return { url: `${publicUrl}/${key}` };
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- mediaStore`
Expected: all 4 tests PASS.

- [ ] **Step 7: Full check**

Run: `npm run check && npm run lint`
Expected: both clean.

- [ ] **Step 8 (only if the user confirmed real R2 credentials in Step 1): a real smoke test**

In a scratch Node REPL or a throwaway script (not committed), with the real env vars loaded:

```ts
import { getMediaStore } from './src/lib/mediaStore';
import { Readable } from 'node:stream';

const store = getMediaStore();
const body = Readable.from([Buffer.from('hello world')]);
const { url } = await store.upload(body, { contentType: 'text/plain', extension: 'txt' });
console.log(url);
```

Fetch that URL in a browser or `curl` — confirm it returns `hello world`. This proves the R2 bucket, credentials, and public-URL configuration are all correct before Task 3 builds a whole route on top of them. Delete the scratch script afterward.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/mediaStore.ts src/lib/mediaStore.test.ts
git commit -m "Add R2-backed mediaStore module"
```

---

### Task 3: `app/api/upload/route.ts`

**Files:**
- Create: `app/api/upload/route.ts`
- Modify: `middleware.ts`
- Test: `app/api/upload/route.test.ts`

**Interfaces:**
- Consumes: `getMediaStore()` from `src/lib/mediaStore.ts` (Task 2); `isAllowedEmail` from `src/lib/allowedEmails.ts`; `auth` from `auth.ts`.
- Produces: `POST /api/upload` — request: raw file bytes as the body, `Content-Type` header set to the file's MIME type, `X-File-Extension` header set to the file extension (no leading dot). Response: `200` with a streamed `application/x-ndjson` body of `{"type":"progress","loaded":N,"total":N}` lines followed by one final `{"type":"done","url":"..."}` or `{"type":"error","message":"..."}` line; or a non-streamed `403`/`400` for auth/validation failures. Task 5's `MediaField` component is the consumer.

- [ ] **Step 1: Write the failing tests**

Create `app/api/upload/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../auth', () => ({ auth: vi.fn() }));
vi.mock('../../../src/lib/mediaStore', () => ({ getMediaStore: vi.fn() }));

import { auth } from '../../../auth';
import { getMediaStore } from '../../../src/lib/mediaStore';
import { POST } from './route';

function makeRequest(init: {
  body?: BodyInit;
  contentType?: string;
  extension?: string;
  contentLength?: string;
}): Request {
  const headers = new Headers();
  if (init.contentType !== undefined) headers.set('content-type', init.contentType);
  if (init.extension !== undefined) headers.set('x-file-extension', init.extension);
  if (init.contentLength !== undefined) headers.set('content-length', init.contentLength);
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers,
    body: init.body,
  });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'owner@example.com' },
      expires: '',
    } as never);
    process.env.ALLOWED_EMAILS = 'owner@example.com';
  });

  it('returns 403 for a non-allow-listed session before calling mediaStore', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'stranger@example.com' },
      expires: '',
    } as never);
    const response = await POST(
      makeRequest({ contentType: 'image/png', extension: 'png' }),
    );
    expect(response.status).toBe(403);
    expect(getMediaStore).not.toHaveBeenCalled();
  });

  it('returns 400 for a disallowed content type before calling mediaStore', async () => {
    const response = await POST(
      makeRequest({ contentType: 'application/pdf', extension: 'pdf' }),
    );
    expect(response.status).toBe(400);
    expect(getMediaStore).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing/invalid X-File-Extension header', async () => {
    const response = await POST(
      makeRequest({ contentType: 'image/png', extension: '../../etc' }),
    );
    expect(response.status).toBe(400);
    expect(getMediaStore).not.toHaveBeenCalled();
  });

  it('returns 400 when Content-Length exceeds the size cap', async () => {
    const response = await POST(
      makeRequest({
        contentType: 'video/mp4',
        extension: 'mp4',
        contentLength: String(600 * 1024 * 1024),
      }),
    );
    expect(response.status).toBe(400);
    expect(getMediaStore).not.toHaveBeenCalled();
  });

  it('streams a done event with the resulting URL on success', async () => {
    vi.mocked(getMediaStore).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ url: 'https://media.example.com/media/x.png' }),
    });
    const response = await POST(
      makeRequest({ body: 'fake-bytes', contentType: 'image/png', extension: 'png' }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.at(-1)).toEqual({
      type: 'done',
      url: 'https://media.example.com/media/x.png',
    });
  });

  it('streams an error event when the upload rejects', async () => {
    vi.mocked(getMediaStore).mockReturnValue({
      upload: vi.fn().mockRejectedValue(new Error('R2 is down')),
    });
    const response = await POST(
      makeRequest({ body: 'fake-bytes', contentType: 'image/png', extension: 'png' }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.at(-1)).toEqual({ type: 'error', message: 'R2 is down' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement `app/api/upload/route.ts`**

```ts
import { Readable } from 'node:stream';
import { auth } from '../../../auth';
import { isAllowedEmail } from '../../../src/lib/allowedEmails';
import { getMediaStore } from '../../../src/lib/mediaStore';

const ALLOWED_CONTENT_TYPE_PREFIXES = ['image/', 'video/'];
// Proposed default from the spec's open questions — confirm/adjust with
// the site owner. A single cap covers both; images will never get close
// to it in practice.
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/i;

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix),
  );
}

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  // Re-check server-side even though middleware already gates this path —
  // same defense-in-depth reasoning as /api/puck and saveTabBlocksAction.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return new Response('Not authorized', { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!isAllowedContentType(contentType)) {
    return new Response(`Unsupported content type: ${contentType || '(none)'}`, {
      status: 400,
    });
  }

  const extension = request.headers.get('x-file-extension') ?? '';
  if (!EXTENSION_PATTERN.test(extension)) {
    return new Response('Missing or invalid X-File-Extension header', {
      status: 400,
    });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return new Response(
      `File too large: ${contentLength} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit`,
      { status: 400 },
    );
  }

  if (!request.body) {
    return new Response('Missing request body', { status: 400 });
  }

  // `Readable.fromWeb` expects `node:stream/web`'s `ReadableStream`, a
  // distinct nominal type from the DOM-lib `ReadableStream` that
  // `Request.body` is typed as here, even though they're the same object
  // shape at runtime (verified against node_modules/@types/node/stream.d.ts's
  // `Readable.fromWeb` signature) — hence the cast.
  const nodeBody = Readable.fromWeb(request.body as never);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const mediaStore = getMediaStore();
        const { url } = await mediaStore.upload(nodeBody, {
          contentType,
          extension,
          onProgress: (progress) => {
            controller.enqueue(
              ndjson({
                type: 'progress',
                loaded: progress.loaded,
                total: progress.total || contentLength,
              }),
            );
          },
        });
        controller.enqueue(ndjson({ type: 'done', url }));
      } catch (error) {
        controller.enqueue(
          ndjson({
            type: 'error',
            message: error instanceof Error ? error.message : 'Upload failed',
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- route.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Protect `/api/upload` at the middleware layer too**

In `middleware.ts`, update the protected-path check and the matcher (read the file first — both need the same new entry, and the matcher's existing comment about the bare `/admin` vs `/admin/:path*` gap explains why an exact-path entry matters):

```ts
const isProtected =
  req.nextUrl.pathname.startsWith('/admin') ||
  req.nextUrl.pathname.startsWith('/api/puck') ||
  req.nextUrl.pathname.startsWith('/api/upload');
```

```ts
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/puck/:path*', '/api/upload'],
};
```

(`/api/upload` is a plain `route.ts`, not a `[...all]` catch-all, so — like `/api/puck`'s bare-path note already explains — only the exact path needs an entry, no `:path*` variant.)

- [ ] **Step 6: Full check**

Run: `npm run check && npm run lint && npm run test`
Expected: all clean/passing.

- [ ] **Step 7: Commit**

```bash
git add app/api/upload/route.ts app/api/upload/route.test.ts middleware.ts
git commit -m "Add auth-gated /api/upload route proxying uploads to R2"
```

---

### Task 4: Verify large-file streaming against a real Netlify deploy

**Files:** none — manual verification only, before investing in Task 5's UI.

This exists because of a real open question: `@netlify/plugin-nextjs` generates a modern-Functions-API handler (verified in Task 2/3's design — `node_modules/@netlify/plugin-nextjs/dist/build/templates/handler.tmpl.js` exports a `(req: Request, context)` handler, not the older Lambda-compatible event/callback signature, so the strict ~4.5MB effective limit of that older mode does not apply here) but no exact documented request-body ceiling was found for this mode. `next dev` locally never exercises Netlify's actual Function wrapper at all — this can only be checked against a real deployed preview.

- [ ] **Step 1: Push the branch and get a deploy preview**

```bash
git push -u origin feature/admin-media-upload
```

Open a PR (or use Netlify's branch-deploy feature if configured) so Netlify builds a deploy preview for this branch. Set the five `R2_*` env vars in Netlify's site settings if not already there (Task 2, Step 1).

- [ ] **Step 2: Sign in and exercise the real route from a real browser**

Sign in to the deploy preview's `/admin` with an allow-listed Google account. Open the browser's devtools console and run something like this against a synthetic ~50MB payload (well above a typical photo, comfortably below the 500MB cap, and large enough to surface a hidden platform ceiling if one exists):

```js
const bytes = new Uint8Array(50 * 1024 * 1024);
const res = await fetch('/api/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'image/png', 'X-File-Extension': 'png' },
  body: bytes,
});
console.log(res.status, await res.text());
```

- [ ] **Step 3: Record the result**

Expected: `200` with a final `{"type":"done","url":"..."}` line, and the URL is reachable and returns the uploaded bytes.

If this fails (a platform size/timeout error instead), stop here and report back before starting Task 5 — the fallback options from the original design discussion (a lower size cap, or chunked upload) need to be reconsidered with real data instead of assumption. Do not silently build the chunked-upload path preemptively; only do that if this step actually demonstrates the simple approach doesn't work.

---

### Task 5: Custom Puck field for upload-or-paste, with progress toasts

**Files:**
- Create: `src/components/MediaField.tsx`
- Modify: `puck.config.tsx`
- Test: `src/components/MediaField.test.tsx`

**Interfaces:**
- Consumes: `toast` from `src/lib/use-toast.ts` (existing).
- Produces: `MediaField({ kind: 'image' | 'video'; value: string; onChange: (value: string) => void })` — a React component, used only from `puck.config.tsx`'s `GalleryItem.image`/`videoUrl` field `render` functions.

- [ ] **Step 1: Write the failing tests**

Create `src/components/MediaField.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaField } from './MediaField';

describe('MediaField', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onChange when the URL text input changes', () => {
    const onChange = vi.fn();
    render(<MediaField kind="image" value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Paste a URL…'), {
      target: { value: 'https://example.com/p.jpg' },
    });
    expect(onChange).toHaveBeenCalledWith('https://example.com/p.jpg');
  });

  it('shows the current value in the text input', () => {
    render(
      <MediaField kind="image" value="https://example.com/p.jpg" onChange={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText('Paste a URL…')).toHaveValue(
      'https://example.com/p.jpg',
    );
  });

  it("restricts the file picker's accept attribute by kind", () => {
    const { container: imageContainer } = render(
      <MediaField kind="image" value="" onChange={vi.fn()} />,
    );
    expect(findFileInput(imageContainer)).toHaveAttribute('accept', 'image/*');

    const { container: videoContainer } = render(
      <MediaField kind="video" value="" onChange={vi.fn()} />,
    );
    expect(findFileInput(videoContainer)).toHaveAttribute('accept', 'video/*');
  });
});

function findFileInput(container: HTMLElement): HTMLInputElement {
  // biome-ignore lint/style/noNonNullAssertion: MediaField always renders exactly one file input.
  return container.querySelector('input[type="file"]')!;
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- MediaField`
Expected: FAIL — `./MediaField` doesn't exist yet.

- [ ] **Step 3: Implement `src/components/MediaField.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { toast } from '../lib/use-toast';

interface Props {
  kind: 'image' | 'video';
  value: string;
  onChange: (value: string) => void;
}

interface UploadEvent {
  type: 'progress' | 'done' | 'error';
  loaded?: number;
  total?: number;
  url?: string;
  message?: string;
}

const MAX_EXTENSION_LENGTH = 10;

function extensionFromFile(file: File): string {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1) : '';
  return ext.slice(0, MAX_EXTENSION_LENGTH) || 'bin';
}

export function MediaField({ kind, value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setUploading(true);
    const label = kind === 'video' ? 'video' : 'image';
    const { id, update } = toast({ description: `Uploading ${label}… 0%` });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-File-Extension', extensionFromFile(file));

    let lastProcessedLength = 0;

    // Browser -> our server leg: real upload progress from the XHR itself.
    // Scaled to the first half of the bar; the second half is the
    // server -> R2 leg, reported via the streamed response below.
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 50);
      update({ id, description: `Uploading ${label}… ${pct}%` });
    };

    // Server -> R2 leg: the response body streams newline-delimited JSON
    // as it arrives. `xhr.responseText` grows as bytes arrive even before
    // the request completes, so each `onprogress` tick parses only the
    // newly-arrived suffix.
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(lastProcessedLength);
      lastProcessedLength = xhr.responseText.length;
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        let parsed: UploadEvent;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (parsed.type === 'progress' && parsed.total) {
          const pct = 50 + Math.round(((parsed.loaded ?? 0) / parsed.total) * 50);
          update({ id, description: `Uploading ${label}… ${pct}%` });
        } else if (parsed.type === 'done' && parsed.url) {
          onChange(parsed.url);
          update({ id, title: 'Uploaded.', description: undefined });
        } else if (parsed.type === 'error') {
          update({
            id,
            variant: 'destructive',
            title: 'Upload failed',
            description: parsed.message ?? 'Unknown error',
          });
        }
      }
    };

    xhr.onerror = () => {
      update({
        id,
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Network error',
      });
    };
    xhr.onloadend = () => setUploading(false);

    xhr.send(file);
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste a URL…"
        style={{ flex: 1 }}
      />
      <input
        ref={inputRef}
        type="file"
        accept={kind === 'video' ? 'video/*' : 'image/*'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- MediaField`
Expected: all 3 tests PASS.

- [ ] **Step 5: Wire it into `puck.config.tsx`**

Add the import:

```tsx
import { MediaField } from './src/components/MediaField';
```

Replace `GalleryItem`'s `image`/`videoUrl` field entries (leave `itemType` and the Task 1 `caption` field as they are):

```tsx
image: {
  type: 'custom',
  render: ({ value, onChange }) => (
    <MediaField kind="image" value={value ?? ''} onChange={onChange} />
  ),
},
videoUrl: {
  type: 'custom',
  render: ({ value, onChange }) => (
    <MediaField kind="video" value={value ?? ''} onChange={onChange} />
  ),
},
```

- [ ] **Step 6: Full check**

Run: `npm run check && npm run lint && npm run test`
Expected: all clean/passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/MediaField.tsx src/components/MediaField.test.tsx puck.config.tsx
git commit -m "Add upload-or-paste custom Puck field for gallery media"
```

---

### Task 6: Docs, and final end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the R2 env vars to `README.md`'s table**

In the existing env var table (`README.md`, the "Env vars required" section), add a row after `PUCK_API_KEY`:

```markdown
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Cloudflare R2 bucket credentials for admin-uploaded gallery images/video. `R2_PUBLIC_URL` is the bucket's `r2.dev` URL or a custom domain, no trailing slash. |
```

- [ ] **Step 2: Document the media storage backend in `CLAUDE.md`**

Add a short new section to `CLAUDE.md`, after the existing "The one invariant" section (which documents the JSON content store) — this is a second, separate storage backend, and should read as deliberate rather than be mistaken for scope creep later:

```markdown
## Media uploads live in Cloudflare R2, separately from the content store

Gallery images/video uploaded through `/admin` are stored in a Cloudflare R2
bucket (`src/lib/mediaStore.ts`), not Netlify Blobs — Blobs isn't a public
CDN, and mixing binary media into the JSON-shaped content store would
conflate two different storage needs. `app/api/upload/route.ts` is a plain
Route Handler (not a Server Action — Next.js Server Actions cap request
bodies at 1MB by default) that proxies the upload through to R2 and streams
progress back to the browser. The gallery-item field still accepts a
pasted URL as an alternative to uploading (`src/components/MediaField.tsx`).
```

- [ ] **Step 3: Full automated check**

Run: `npm run check && npm run lint && npm run test && npm run build`
Expected: all green.

- [ ] **Step 4: Full manual checklist**

1. `/admin`, media tab: upload a real image file — progress toast updates, ends on "Uploaded.", the field fills with a public R2 URL.
2. Repeat with a real (short) video file.
3. Paste a URL directly into the same field instead of uploading — still works.
4. Add a caption, publish, confirm the public page renders the image/video and the caption text.
5. Confirm the toast for a deliberately-broken upload (e.g. disconnect network mid-upload, or temporarily use a wrong `R2_BUCKET_NAME`) shows a destructive "Upload failed" toast rather than hanging or silently failing.
6. Confirm `POST /api/upload` from a signed-out session (or a non-allow-listed account) returns 403.

- [ ] **Step 5: Commit and push**

```bash
git add README.md CLAUDE.md
git commit -m "Document the R2 media storage backend"
git push origin feature/admin-media-upload
```

- [ ] **Step 6: Report back to the user**

Summarize what was built, the result of Task 4's real-deploy streaming verification, and anything from the "Open questions" section of the spec (file size cap, r2.dev vs. custom domain, orphaned-object cleanup) that was left as-is versus revisited during implementation, so the user can decide whether to merge `feature/admin-media-upload`.
