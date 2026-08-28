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

  it('getEtag returns null for a key that has never been written', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    expect(await store.getEtag('current.json')).toBeNull();
  });

  it('getEtag changes after the value is overwritten', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('current.json', { hero: { name: 'A' } });
    const etag1 = await store.getEtag('current.json');
    await store.setJSON('current.json', { hero: { name: 'B' } });
    const etag2 = await store.getEtag('current.json');
    expect(etag1).not.toBeNull();
    expect(etag2).not.toBe(etag1);
  });

  it('setJSON with ifMatch: null succeeds only if the key does not exist yet', async () => {
    const { getContentStore, SaveConflictError } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON(
      'current.json',
      { hero: { name: 'First' } },
      {
        ifMatch: null,
      },
    );
    await expect(
      store.setJSON(
        'current.json',
        { hero: { name: 'Second' } },
        { ifMatch: null },
      ),
    ).rejects.toThrow(SaveConflictError);
  });

  it('setJSON with a stale ifMatch throws SaveConflictError instead of writing', async () => {
    const { getContentStore, SaveConflictError } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('current.json', { hero: { name: 'A' } });
    const staleEtag = await store.getEtag('current.json');
    await store.setJSON('current.json', { hero: { name: 'B' } });

    await expect(
      store.setJSON(
        'current.json',
        { hero: { name: 'C' } },
        { ifMatch: staleEtag },
      ),
    ).rejects.toThrow(SaveConflictError);
    expect(await store.get('current.json')).toEqual({
      hero: { name: 'B' },
    });
  });

  it('setJSON with a matching ifMatch writes normally', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('current.json', { hero: { name: 'A' } });
    const currentEtag = await store.getEtag('current.json');

    await store.setJSON(
      'current.json',
      { hero: { name: 'B' } },
      { ifMatch: currentEtag },
    );
    expect(await store.get('current.json')).toEqual({ hero: { name: 'B' } });
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

  it('getEtag reads via getMetadata, not a full body fetch', async () => {
    const mockGetMetadata = vi.fn().mockResolvedValue({ etag: 'abc123' });
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({ getMetadata: mockGetMetadata })),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    const etag = await store.getEtag('current.json');

    expect(mockGetMetadata).toHaveBeenCalledWith('current.json');
    expect(etag).toBe('abc123');
  });

  it('getEtag returns null when getMetadata finds nothing', async () => {
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({ getMetadata: vi.fn().mockResolvedValue(null) })),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    expect(await store.getEtag('current.json')).toBeNull();
  });

  it('setJSON with a stale ifMatch throws SaveConflictError without writing', async () => {
    const mockGetMetadata = vi.fn().mockResolvedValue({ etag: 'current-etag' });
    const mockSetJSON = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({
        getMetadata: mockGetMetadata,
        setJSON: mockSetJSON,
      })),
    }));

    const { getContentStore, SaveConflictError } = await import('./blobStore');
    const store = getContentStore('portfolio');

    await expect(
      store.setJSON(
        'current.json',
        { hero: { name: 'New' } },
        { ifMatch: 'stale-etag' },
      ),
    ).rejects.toThrow(SaveConflictError);
    expect(mockSetJSON).not.toHaveBeenCalled();
  });

  it('setJSON with a matching ifMatch writes normally', async () => {
    const mockGetMetadata = vi.fn().mockResolvedValue({ etag: 'current-etag' });
    const mockSetJSON = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@netlify/blobs', () => ({
      getStore: vi.fn(() => ({
        getMetadata: mockGetMetadata,
        setJSON: mockSetJSON,
      })),
    }));

    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');

    await store.setJSON(
      'current.json',
      { hero: { name: 'New' } },
      { ifMatch: 'current-etag' },
    );
    expect(mockSetJSON).toHaveBeenCalledWith('current.json', {
      hero: { name: 'New' },
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
