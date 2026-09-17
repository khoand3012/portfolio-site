import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMediaStore } from './mediaStore';

// Vitest runs with no Netlify Blobs environment, so getStore() throws
// MissingBlobsEnvironmentError and getMediaStore() hands back the local
// filesystem fallback — which is exactly the half that runs under `next dev`
// and the half with logic worth pinning.
describe('getMediaStore (local filesystem fallback)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'media-store-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function bytesOf(...values: number[]): ArrayBuffer {
    return new Uint8Array(values).buffer;
  }

  it('round-trips bytes and content type', async () => {
    const store = getMediaStore();
    await store.put('abc.png', bytesOf(1, 2, 3, 4), 'image/png');

    const read = await store.get('abc.png');
    expect(read).not.toBeNull();
    expect(new Uint8Array(read?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(read?.contentType).toBe('image/png');
  });

  it('writes the raw bytes to disk, not JSON', async () => {
    const store = getMediaStore();
    await store.put('raw.png', bytesOf(0x89, 0x50, 0x4e, 0x47), 'image/png');

    const onDisk = readFileSync(
      path.join(dir, '.local-blobs', 'media', 'raw.png'),
    );
    // The PNG magic number survives verbatim — the content store's
    // JSON.stringify path would have mangled this.
    expect([...onDisk]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('returns null for a key that was never written', async () => {
    expect(await getMediaStore().get('missing.png')).toBeNull();
  });

  it('does not leak neighbouring bytes from a pooled Buffer', async () => {
    const store = getMediaStore();
    // Several small writes in a row are the case where Node hands back slices
    // of one shared allocation arena.
    await store.put('a.png', bytesOf(1, 1, 1), 'image/png');
    await store.put('b.png', bytesOf(2, 2, 2), 'image/png');

    const a = await store.get('a.png');
    expect(a?.bytes.byteLength).toBe(3);
    expect(new Uint8Array(a?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([1, 1, 1]),
    );
  });

  it('falls back to a generic content type when the sidecar is missing', async () => {
    const store = getMediaStore();
    await store.put('x.png', bytesOf(9), 'image/png');
    // Simulate a blob written before the sidecar existed.
    writeFileSync(
      path.join(dir, '.local-blobs', 'media', 'x.png.meta.json'),
      JSON.stringify({}),
    );

    expect((await store.get('x.png'))?.contentType).toBe(
      'application/octet-stream',
    );
  });
});
