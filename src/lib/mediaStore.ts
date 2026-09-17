import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

/**
 * Binary media storage, deliberately a SEPARATE module from `blobStore.ts`.
 *
 * `ContentStore` is JSON-only by construction — `setJSON` serializes, `get`
 * parses, and its local-dev fallback runs `JSON.parse` over the file it
 * reads. Uploaded image bytes cannot travel through any of that, so this is
 * a sibling store with its own interface rather than a widening of that one.
 *
 * Why Netlify Blobs at all, when
 * `docs/superpowers/specs/2026-08-28-admin-media-upload-design.md` specifies
 * Cloudflare R2: that spec covers the *media gallery* — images and video up
 * to 500MB, served straight off a public CDN. This is one small avatar,
 * capped at 5MB and served through `app/api/media`. Blobs needs no new
 * credentials (the site already has them), so the avatar works on the next
 * deploy instead of waiting on a bucket the owner hasn't provisioned. The
 * stored value is just a URL string, so moving avatars to R2 later only
 * changes where new uploads land.
 */
export interface StoredMedia {
  bytes: ArrayBuffer;
  contentType: string;
}

export interface MediaStore {
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredMedia | null>;
}

const STORE_NAME = 'media';
// Fallback for a blob stored without usable metadata. Deliberately generic:
// serving a guessed `image/svg+xml` would hand back an active document.
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

// Mirrors blobStore.ts's localFileStore, for the same reason and under the
// same trigger — but writing raw bytes, plus a small JSON sidecar for the
// content type (the filesystem has nowhere else to put blob metadata).
function localFileMediaStore(): MediaStore {
  const baseDir = path.join(process.cwd(), '.local-blobs', STORE_NAME);

  return {
    async put(key, bytes, contentType) {
      const filePath = path.join(baseDir, key);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, Buffer.from(bytes));
      writeFileSync(`${filePath}.meta.json`, JSON.stringify({ contentType }));
    },
    async get(key) {
      const filePath = path.join(baseDir, key);
      if (!existsSync(filePath)) return null;
      const file = readFileSync(filePath);
      let contentType = DEFAULT_CONTENT_TYPE;
      const metaPath = `${filePath}.meta.json`;
      if (existsSync(metaPath)) {
        contentType =
          JSON.parse(readFileSync(metaPath, 'utf8')).contentType ??
          DEFAULT_CONTENT_TYPE;
      }
      // Copied into a standalone ArrayBuffer rather than handing back
      // `file.buffer`: Node pools small Buffer allocations, so `.buffer` can
      // be a larger shared arena whose other bytes belong to someone else.
      const bytes = file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      ) as ArrayBuffer;
      return { bytes, contentType };
    },
  };
}

function netlifyMediaStore(): MediaStore {
  const store = getStore(STORE_NAME);
  return {
    async put(key, bytes, contentType) {
      // `set` (not `setJSON`) takes `string | ArrayBuffer | Blob` — verified
      // against node_modules/@netlify/blobs/dist/main.d.ts's `Store.set`.
      await store.set(key, bytes, { metadata: { contentType } });
    },
    async get(key) {
      const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      // The `arrayBuffer` overload's return type omits `| null`, unlike every
      // other overload on getWithMetadata. That looks like an SDK typing slip
      // rather than a guarantee, so a missing key is still handled here — the
      // alternative is a TypeError on the first request for a deleted blob.
      if (!result) return null;
      const contentType = result.metadata?.contentType;
      return {
        bytes: result.data,
        contentType:
          typeof contentType === 'string' ? contentType : DEFAULT_CONTENT_TYPE,
      };
    },
  };
}

// Same MissingBlobsEnvironmentError branch as getContentStore — see the long
// comment in blobStore.ts for why that thrown error, and not `process.env
// .NETLIFY`, is the reliable signal that real Blobs are unavailable.
function isMissingBlobsEnvironmentError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'MissingBlobsEnvironmentError'
  );
}

export function getMediaStore(): MediaStore {
  try {
    return netlifyMediaStore();
  } catch (error) {
    if (isMissingBlobsEnvironmentError(error)) {
      return localFileMediaStore();
    }
    throw error;
  }
}
