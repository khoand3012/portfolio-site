import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

export interface ContentStore {
  get(key: string): Promise<unknown | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

function localFileStore(storeName: string): ContentStore {
  const baseDir = path.join(process.cwd(), '.local-blobs', storeName);
  return {
    async get(key) {
      const filePath = path.join(baseDir, key);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf8'));
    },
    async setJSON(key, value) {
      const filePath = path.join(baseDir, key);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(value, null, 2));
    },
  };
}

function netlifyBlobStore(storeName: string): ContentStore {
  const store = getStore(storeName);
  return {
    // `Store.get` returns raw text by default — `{ type: 'json' }` is required
    // to get a parsed value back instead of a JSON string (verified against
    // node_modules/@netlify/blobs/dist/main.d.ts's `get` overloads).
    async get(key) {
      return store.get(key, { type: 'json' });
    },
    async setJSON(key, value) {
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
