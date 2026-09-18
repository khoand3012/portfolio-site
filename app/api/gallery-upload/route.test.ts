import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../auth', () => ({ auth: vi.fn() }));
vi.mock('../../../src/lib/r2Store', () => ({
  isR2Configured: vi.fn(),
  uploadGalleryMedia: vi.fn(),
}));
vi.mock('../../../src/lib/mediaStore', () => ({ getMediaStore: vi.fn() }));

import { auth } from '../../../auth';
import { getMediaStore } from '../../../src/lib/mediaStore';
import { isR2Configured, uploadGalleryMedia } from '../../../src/lib/r2Store';
import { POST } from './route';

const ALLOWED_EMAIL = 'owner@example.com';

function request(
  body: BodyInit | null,
  headers: Record<string, string> = { 'content-type': 'video/mp4' },
): Request {
  return new Request('https://example.com/api/gallery-upload', {
    method: 'POST',
    headers,
    body,
    // Required by undici whenever a Request carries a stream body.
    ...({ duplex: 'half' } as Record<string, unknown>),
  });
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Parses the newline-delimited JSON the route streams back. */
async function events(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

describe('POST /api/gallery-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { email: ALLOWED_EMAIL },
      expires: '',
    } as never);
    process.env.ALLOWED_EMAILS = ALLOWED_EMAIL;
    vi.mocked(isR2Configured).mockReturnValue(true);
    vi.mocked(uploadGalleryMedia).mockResolvedValue({
      url: 'https://pub-abc.r2.dev/media/generated.mp4',
    });
  });

  afterEach(() => {
    process.env.DISABLE_ADMIN_AUTH = undefined;
  });

  describe('authorization', () => {
    it('rejects a signed-out request before reading anything', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      const response = await POST(request(streamOf(new Uint8Array([1]))));
      expect(response.status).toBe(403);
      expect(uploadGalleryMedia).not.toHaveBeenCalled();
    });

    it('rejects a signed-in account outside the allow-list', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: 'someone@else.com' },
        expires: '',
      } as never);
      const response = await POST(request(streamOf(new Uint8Array([1]))));
      expect(response.status).toBe(403);
      expect(uploadGalleryMedia).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('refuses a type outside the allow-list', async () => {
      const response = await POST(
        request(streamOf(new Uint8Array([1])), {
          'content-type': 'image/svg+xml',
        }),
      );
      expect(response.status).toBe(400);
      expect(uploadGalleryMedia).not.toHaveBeenCalled();
    });

    it('refuses an over-cap upload on the declared length, before reading', async () => {
      const response = await POST(
        request(streamOf(new Uint8Array([1])), {
          'content-type': 'video/mp4',
          'content-length': String(200 * 1024 * 1024),
        }),
      );
      expect(response.status).toBe(413);
      expect(uploadGalleryMedia).not.toHaveBeenCalled();
    });

    it('refuses an empty body', async () => {
      const response = await POST(request(null));
      expect(response.status).toBe(400);
    });
  });

  describe('the stored object key', () => {
    it('is generated, never taken from the client', async () => {
      await POST(
        request(streamOf(new Uint8Array([1])), {
          'content-type': 'video/mp4',
          'x-file-name': '../../etc/passwd',
        }),
      );
      const key = vi.mocked(uploadGalleryMedia).mock.calls[0]?.[0] as string;
      expect(key).toMatch(/^media\/[0-9a-f-]{36}\.mp4$/);
      expect(key).not.toContain('passwd');
    });

    it('takes its extension from the validated content type', async () => {
      await POST(
        request(streamOf(new Uint8Array([1])), {
          'content-type': 'image/jpeg',
        }),
      );
      expect(vi.mocked(uploadGalleryMedia).mock.calls[0]?.[0]).toMatch(
        /\.jpg$/,
      );
    });
  });

  describe('the streamed response', () => {
    it('reports progress and then the final URL', async () => {
      vi.mocked(uploadGalleryMedia).mockImplementation(
        async (_key, _body, _type, onProgress) => {
          onProgress({ loaded: 50, total: 100 });
          onProgress({ loaded: 100, total: 100 });
          return { url: 'https://pub-abc.r2.dev/media/generated.mp4' };
        },
      );

      const response = await POST(request(streamOf(new Uint8Array([1]))));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('ndjson');

      expect(await events(response)).toEqual([
        { type: 'progress', loaded: 50, total: 100 },
        { type: 'progress', loaded: 100, total: 100 },
        { type: 'done', url: 'https://pub-abc.r2.dev/media/generated.mp4' },
      ]);
    });

    // The status line is already sent by the time R2 fails, so a failure can
    // only be reported in-band. The client must not read a 200 as success.
    it('reports a mid-stream failure as an error event, not a status code', async () => {
      vi.mocked(uploadGalleryMedia).mockRejectedValue(
        new Error('R2 rejected the request'),
      );

      const response = await POST(request(streamOf(new Uint8Array([1]))));
      expect(response.status).toBe(200);

      const parsed = await events(response);
      expect(parsed.at(-1)).toMatchObject({ type: 'error' });
      expect(parsed.some((e) => e.type === 'done')).toBe(false);
    });
  });

  // Local dev has no R2 credentials. Without this the admin panel's upload
  // button would be untestable outside a real deploy.
  describe('without R2 configured', () => {
    it('stores through the local media store and returns its served path', async () => {
      vi.mocked(isR2Configured).mockReturnValue(false);
      const put = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getMediaStore).mockReturnValue({ put, get: vi.fn() });

      const response = await POST(
        request(streamOf(new Uint8Array([1, 2, 3])), {
          'content-type': 'image/png',
        }),
      );

      const parsed = await events(response);
      expect(put).toHaveBeenCalledTimes(1);
      expect(parsed.at(-1)).toMatchObject({ type: 'done' });
      expect(parsed.at(-1)?.url).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
      expect(uploadGalleryMedia).not.toHaveBeenCalled();
    });
  });
});
