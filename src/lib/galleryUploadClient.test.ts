import { describe, expect, it, vi } from 'vitest';
import { type UploadPhase, uploadGalleryFile } from './galleryUploadClient';

/**
 * A hand-rolled XMLHttpRequest double. jsdom ships an XHR with no network
 * behind it, and the whole point of using XHR over fetch here is
 * `upload.onprogress` — which only a double can drive deterministically.
 */
class FakeXhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 200;
  responseText = '';
  responseURL = 'http://localhost:3000/api/gallery-upload';
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  send(body: unknown) {
    this.body = body;
  }

  /** Simulates the browser→server leg reporting progress. */
  sendProgress(loaded: number, total: number) {
    this.upload.onprogress?.({
      loaded,
      total,
      lengthComputable: true,
    } as ProgressEvent);
  }
  /** Simulates another NDJSON line arriving on the response. */
  emit(line: object) {
    this.responseText += `${JSON.stringify(line)}\n`;
    this.onprogress?.();
  }
  finish() {
    this.onload?.();
  }
}

function run(xhr: FakeXhr, drive: () => void) {
  const file = new Blob(['x'], { type: 'video/mp4' }) as Blob & {
    type: string;
  };
  const phases: { phase: UploadPhase; loaded: number; total?: number }[] = [];
  const promise = uploadGalleryFile(
    file,
    { onProgress: (p) => phases.push(p) },
    () => xhr as unknown as XMLHttpRequest,
  );
  drive();
  return { promise, phases };
}

describe('uploadGalleryFile', () => {
  it('posts the raw file with its type as the Content-Type', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.emit({ type: 'done', url: 'https://pub-abc.r2.dev/media/a.mp4' });
      xhr.finish();
    });

    await promise;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/gallery-upload');
    expect(xhr.headers['content-type']).toBe('video/mp4');
    expect(xhr.body).toBeInstanceOf(Blob);
  });

  it('resolves with the URL from the done event', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.emit({ type: 'done', url: 'https://pub-abc.r2.dev/media/a.mp4' });
      xhr.finish();
    });

    await expect(promise).resolves.toEqual({
      ok: true,
      url: 'https://pub-abc.r2.dev/media/a.mp4',
    });
  });

  it('reports both legs of the upload', async () => {
    const xhr = new FakeXhr();
    const { promise, phases } = run(xhr, () => {
      xhr.sendProgress(50, 100);
      xhr.emit({ type: 'progress', loaded: 30, total: 100 });
      xhr.emit({ type: 'done', url: 'https://pub-abc.r2.dev/media/a.mp4' });
      xhr.finish();
    });

    await promise;
    expect(phases).toEqual([
      { phase: 'sending', loaded: 50, total: 100 },
      { phase: 'storing', loaded: 30, total: 100 },
    ]);
  });

  // The response arrives as a growing string, so a line can be delivered in
  // pieces and several lines can arrive in one event.
  it('parses NDJSON split across progress events', async () => {
    const xhr = new FakeXhr();
    const { promise, phases } = run(xhr, () => {
      xhr.responseText =
        '{"type":"progress","loaded":10,"total":100}\n{"type":"pro';
      xhr.onprogress?.();
      xhr.responseText += 'gress","loaded":20,"total":100}\n';
      xhr.onprogress?.();
      xhr.emit({ type: 'done', url: 'https://pub-abc.r2.dev/media/a.mp4' });
      xhr.finish();
    });

    await promise;
    expect(phases).toEqual([
      { phase: 'storing', loaded: 10, total: 100 },
      { phase: 'storing', loaded: 20, total: 100 },
    ]);
  });

  it('surfaces an error event from the stream', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.emit({ type: 'error', message: 'R2 rejected the request' });
      xhr.finish();
    });

    await expect(promise).resolves.toEqual({
      ok: false,
      message: 'R2 rejected the request',
    });
  });

  // A stream that stops without `done` is a failure however the status reads
  // — the status line went out before the upload was attempted.
  it('treats a stream that ends without a done event as a failure', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.emit({ type: 'progress', loaded: 10, total: 100 });
      xhr.finish();
    });

    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it('reports a 4xx rejection using the route’s own message', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.status = 400;
      xhr.responseText = JSON.stringify({ error: 'Unsupported file type.' });
      xhr.finish();
    });

    await expect(promise).resolves.toEqual({
      ok: false,
      message: 'Unsupported file type.',
    });
  });

  /**
   * The trap CLAUDE.md documents for /api/upload, which bites harder here:
   * XHR follows redirects transparently and has no `redirect: 'manual'`, so
   * middleware's 302 to the sign-in page arrives as a 200 of HTML. Only
   * responseURL reveals it.
   */
  it('detects an expired sign-in from the redirected responseURL', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.status = 200;
      xhr.responseURL = 'http://localhost:3000/api/auth/signin';
      xhr.responseText = '<!DOCTYPE html><html>…</html>';
      xhr.finish();
    });

    const result = await promise;
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(/sign-in expired/i);
  });

  it('reports a network failure', async () => {
    const xhr = new FakeXhr();
    const { promise } = run(xhr, () => {
      xhr.onerror?.();
    });

    const result = await promise;
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(/connection/i);
  });

  it('rejects a disallowed type before opening a request at all', async () => {
    const createXhr = vi.fn();
    const result = await uploadGalleryFile(
      new Blob(['x'], { type: 'image/svg+xml' }) as Blob & { type: string },
      {},
      createXhr as unknown as () => XMLHttpRequest,
    );
    expect(result.ok).toBe(false);
    expect(createXhr).not.toHaveBeenCalled();
  });

  it('rejects an over-cap file before opening a request at all', async () => {
    const createXhr = vi.fn();
    const big = { type: 'video/mp4', size: 200 * 1024 * 1024 } as Blob & {
      type: string;
    };
    const result = await uploadGalleryFile(
      big,
      {},
      createXhr as unknown as () => XMLHttpRequest,
    );
    expect(result.ok).toBe(false);
    expect(createXhr).not.toHaveBeenCalled();
  });
});
