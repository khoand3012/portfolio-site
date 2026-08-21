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

export function getContentStore(storeName: string): ContentStore {
  // Netlify's build/runtime and `netlify dev` both set NETLIFY=true; plain
  // `next dev`/`next start` don't, and have no Blobs context to read from —
  // fall back to a local gitignored JSON store so local dev and manual
  // verification work without requiring the Netlify CLI or a linked site.
  return process.env.NETLIFY ? getStore(storeName) : localFileStore(storeName);
}
