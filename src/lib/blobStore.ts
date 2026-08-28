import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

export interface ContentStore {
  get(key: string): Promise<unknown | null>;
  // Cheap, body-less read of just the current etag — null if the key has
  // never been written. Used for the optimistic-concurrency check below,
  // not for reading content itself.
  getEtag(key: string): Promise<string | null>;
  // `ifMatch` (etag read earlier, or null for "must not exist yet") makes
  // this a check-then-set: it throws SaveConflictError instead of writing
  // if the stored etag no longer matches. Neither backend has a true atomic
  // compare-and-swap (Netlify Blobs' `setJSON` takes no conditional option
  // as of @netlify/blobs 8.2.0 — see main.d.ts's `SetOptions`), so there is
  // still a narrow race between the check and the write; this narrows the
  // conflict window from "the length of an admin edit session" down to one
  // network round trip, which is the best available without a native CAS.
  setJSON(
    key: string,
    value: unknown,
    options?: { ifMatch?: string | null },
  ): Promise<void>;
}

export class SaveConflictError extends Error {
  constructor(key: string) {
    super(`"${key}" was changed by another save since it was last read.`);
    this.name = 'SaveConflictError';
  }
}

function localFileStore(storeName: string): ContentStore {
  const baseDir = path.join(process.cwd(), '.local-blobs', storeName);

  function readEtag(filePath: string): string | null {
    if (!existsSync(filePath)) return null;
    // Content hash rather than mtime: local-dev filesystems' mtime
    // resolution isn't fine-grained enough to reliably distinguish two
    // saves that land within the same tick.
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  }

  return {
    async get(key) {
      const filePath = path.join(baseDir, key);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf8'));
    },
    async getEtag(key) {
      return readEtag(path.join(baseDir, key));
    },
    async setJSON(key, value, options) {
      const filePath = path.join(baseDir, key);
      if (
        options?.ifMatch !== undefined &&
        readEtag(filePath) !== options.ifMatch
      ) {
        throw new SaveConflictError(key);
      }
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(value, null, 2));
    },
  };
}

function netlifyBlobStore(storeName: string): ContentStore {
  const store = getStore(storeName);

  async function readEtag(key: string): Promise<string | null> {
    // `getMetadata` (not `getWithMetadata`) is the cheap etag-only read — it
    // doesn't fetch the blob body, per main.d.ts's `Store.getMetadata`.
    const result = await store.getMetadata(key);
    return result?.etag ?? null;
  }

  return {
    // `Store.get` returns raw text by default — `{ type: 'json' }` is required
    // to get a parsed value back instead of a JSON string (verified against
    // node_modules/@netlify/blobs/dist/main.d.ts's `get` overloads).
    async get(key) {
      return store.get(key, { type: 'json' });
    },
    getEtag: readEtag,
    async setJSON(key, value, options) {
      if (
        options?.ifMatch !== undefined &&
        (await readEtag(key)) !== options.ifMatch
      ) {
        throw new SaveConflictError(key);
      }
      await store.setJSON(key, value);
    },
  };
}

// `getStore(name)` reads Blobs configuration (siteID/token) from the
// NETLIFY_BLOBS_CONTEXT env var / globalThis.netlifyBlobsContext, which
// Netlify's serverless/edge Functions runtime populates automatically (see
// node_modules/@netlify/blobs/README.md, "Environment-based configuration").
// When that context is absent — plain `next dev`/`next start`, or any other
// environment without Blobs wired up — `getStore()` throws
// MissingBlobsEnvironmentError *synchronously*, before any network call
// (verified in node_modules/@netlify/blobs/dist/chunk-XR3MUBBK.js's
// getClientOptions). That's a more reliable signal than `process.env.NETLIFY`
// — documented only as a build-time flag, with its presence in the Functions
// runtime unconfirmed — for deciding whether real Blobs are usable, so branch
// on the actual failure instead of guessing from an env var.
function isMissingBlobsEnvironmentError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'MissingBlobsEnvironmentError'
  );
}

export function getContentStore(storeName: string): ContentStore {
  try {
    return netlifyBlobStore(storeName);
  } catch (error) {
    if (isMissingBlobsEnvironmentError(error)) {
      return localFileStore(storeName);
    }
    throw error;
  }
}
