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
    expect(await store.get('history/2026-01-01.json')).toEqual({
      hero: { name: 'Test' },
    });
  });
});

describe('getContentStore (real Blobs, mocked)', () => {
  afterEach(() => {
    vi.doUnmock('@netlify/blobs');
  });

  it('reads with { type: "json" } so callers get a parsed value, not raw text', async () => {
    // Regression test for the bug where the Netlify branch called
    // `store.get(key)` with no options, which returns raw text per
    // @netlify/blobs' `get` overloads — this would have caught it.
    const mockGet = vi.fn().mockResolvedValue({ hero: { name: 'Mocked' } });
    const mockSetJSON = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({ get: mockGet, setJSON: mockSetJSON })),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    const result = await store.get('current.json');

    expect(mockGet).toHaveBeenCalledWith('current.json', { type: 'json' });
    expect(result).toEqual({ hero: { name: 'Mocked' } });
  });

  it('writes with setJSON', async () => {
    const mockGet = vi.fn().mockResolvedValue(null);
    const mockSetJSON = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({ get: mockGet, setJSON: mockSetJSON })),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('current.json', { hero: { name: 'Saved' } });

    expect(mockSetJSON).toHaveBeenCalledWith('current.json', {
      hero: { name: 'Saved' },
    });
  });

  it('falls back to the local file store when getStore throws MissingBlobsEnvironmentError', async () => {
    class MissingBlobsEnvironmentError extends Error {
      constructor() {
        super('The environment has not been configured to use Netlify Blobs.');
        this.name = 'MissingBlobsEnvironmentError';
      }
    }
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => {
        throw new MissingBlobsEnvironmentError();
      }),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    // Reaching the local file fallback (rather than throwing) is the thing
    // under test — round-tripping a value proves it's actually usable.
    await store.setJSON('current.json', { hero: { name: 'Local' } });
    expect(await store.get('current.json')).toEqual({
      hero: { name: 'Local' },
    });
  });
});
