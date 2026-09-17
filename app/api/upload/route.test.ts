import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../auth', () => ({ auth: vi.fn() }));
vi.mock('../../../src/lib/mediaStore', () => ({ getMediaStore: vi.fn() }));

import { auth } from '../../../auth';
import { getMediaStore } from '../../../src/lib/mediaStore';
import { POST } from './route';

const ALLOWED_EMAIL = 'owner@example.com';

function request(
  body: BodyInit,
  headers: Record<string, string> = { 'content-type': 'image/png' },
): Request {
  return new Request('https://example.com/api/upload', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/upload', () => {
  const put = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { email: ALLOWED_EMAIL },
      expires: '',
    } as never);
    process.env.ALLOWED_EMAILS = ALLOWED_EMAIL;
    put.mockResolvedValue(undefined);
    vi.mocked(getMediaStore).mockReturnValue({ put, get: vi.fn() });
  });

  afterEach(() => {
    process.env.DISABLE_ADMIN_AUTH = undefined;
  });

  it('rejects a session email not on the allow-list before storing anything', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'stranger@example.com' },
      expires: '',
    } as never);
    const response = await POST(request(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects an unsupported content type before storing anything', async () => {
    const response = await POST(
      request(new Uint8Array([1, 2, 3]), { 'content-type': 'application/pdf' }),
    );
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects SVG — it is an active document served from our own origin', async () => {
    const response = await POST(
      request(new Uint8Array([1, 2, 3]), { 'content-type': 'image/svg+xml' }),
    );
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a body over the size cap', async () => {
    const response = await POST(
      request(new Uint8Array(5 * 1024 * 1024 + 1), {
        'content-type': 'image/png',
      }),
    );
    expect(response.status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects an empty body', async () => {
    const response = await POST(request(new Uint8Array(0)));
    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('stores the bytes under a generated uuid key and returns its media URL', async () => {
    const response = await POST(request(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);

    const call = put.mock.calls[0];
    if (!call) throw new Error('expected the media store to be written to');
    const [key, bytes, contentType] = call;
    // The key is generated, never taken from anything client-supplied.
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(contentType).toBe('image/png');
  });

  it('normalizes a jpeg content type with parameters to a .jpg key', async () => {
    const response = await POST(
      request(new Uint8Array([1]), {
        'content-type': 'IMAGE/JPEG; charset=binary',
      }),
    );
    expect(response.status).toBe(200);
    const call = put.mock.calls[0];
    if (!call) throw new Error('expected the media store to be written to');
    expect(call[0]).toMatch(/\.jpg$/);
    expect(call[2]).toBe('image/jpeg');
  });

  it('reports a store failure as a 500 rather than throwing', async () => {
    put.mockRejectedValue(new Error('blobs are down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(request(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(500);
  });

  it('skips the auth check under the local-dev bypass', async () => {
    process.env.DISABLE_ADMIN_AUTH = 'true';
    const response = await POST(request(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(200);
    expect(auth).not.toHaveBeenCalled();
  });
});
