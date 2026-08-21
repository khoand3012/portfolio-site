import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'blobstore-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  vi.resetModules();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('getContentStore (local file fallback)', () => {
  it('returns null for a key that has never been written', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    expect(await store.get('current.json')).toBeNull();
  });

  it('round-trips a value written with setJSON, including nested keys', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('history/2026-01-01.json', { hero: { name: 'Test' } });
    expect(await store.get('history/2026-01-01.json')).toEqual({ hero: { name: 'Test' } });
  });
});
