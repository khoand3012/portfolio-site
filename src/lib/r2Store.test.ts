import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadDone = vi.fn();
const uploadOn = vi.fn();
const uploadCtor = vi.fn();

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(params: unknown) {
      uploadCtor(params);
    }
    on(event: string, handler: (p: unknown) => void) {
      uploadOn(event, handler);
    }
    done() {
      return uploadDone();
    }
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

const R2_ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'portfolio-media',
  R2_PUBLIC_URL: 'https://pub-abc123.r2.dev',
};

async function loadStore() {
  vi.resetModules();
  return await import('./r2Store');
}

describe('isR2Configured', () => {
  beforeEach(() => {
    for (const key of Object.keys(R2_ENV)) delete process.env[key];
    uploadDone.mockReset().mockResolvedValue(undefined);
    uploadCtor.mockReset();
    uploadOn.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(R2_ENV)) delete process.env[key];
  });

  it('is false when nothing is configured', async () => {
    const { isR2Configured } = await loadStore();
    expect(isR2Configured()).toBe(false);
  });

  // Half-configured is the dangerous state: it would build an S3 client that
  // fails at request time instead of falling back to local storage.
  it('is false when only some of the five vars are set', async () => {
    process.env.R2_ACCOUNT_ID = R2_ENV.R2_ACCOUNT_ID;
    process.env.R2_BUCKET_NAME = R2_ENV.R2_BUCKET_NAME;
    const { isR2Configured } = await loadStore();
    expect(isR2Configured()).toBe(false);
  });

  it('is true only with all five', async () => {
    Object.assign(process.env, R2_ENV);
    const { isR2Configured } = await loadStore();
    expect(isR2Configured()).toBe(true);
  });
});

describe('uploadGalleryMedia against R2', () => {
  beforeEach(() => {
    Object.assign(process.env, R2_ENV);
    uploadDone.mockReset().mockResolvedValue(undefined);
    uploadCtor.mockReset();
    uploadOn.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(R2_ENV)) delete process.env[key];
  });

  it('puts the body in the configured bucket under the given key', async () => {
    const { uploadGalleryMedia } = await loadStore();
    const body = new ReadableStream();

    await uploadGalleryMedia('media/abc.mp4', body, 'video/mp4', () => {});

    expect(uploadCtor).toHaveBeenCalledTimes(1);
    const params = uploadCtor.mock.calls[0]?.[0] as {
      params: Record<string, unknown>;
    };
    expect(params.params).toMatchObject({
      Bucket: 'portfolio-media',
      Key: 'media/abc.mp4',
      Body: body,
      ContentType: 'video/mp4',
    });
  });

  it('returns the public URL the owner configured, not an S3 endpoint', async () => {
    const { uploadGalleryMedia } = await loadStore();
    const result = await uploadGalleryMedia(
      'media/abc.mp4',
      new ReadableStream(),
      'video/mp4',
      () => {},
    );
    expect(result.url).toBe('https://pub-abc123.r2.dev/media/abc.mp4');
  });

  // A configured base URL with a trailing slash would otherwise produce a
  // double slash in every stored URL.
  it('tolerates a trailing slash on R2_PUBLIC_URL', async () => {
    process.env.R2_PUBLIC_URL = 'https://pub-abc123.r2.dev/';
    const { uploadGalleryMedia } = await loadStore();
    const result = await uploadGalleryMedia(
      'media/abc.mp4',
      new ReadableStream(),
      'video/mp4',
      () => {},
    );
    expect(result.url).toBe('https://pub-abc123.r2.dev/media/abc.mp4');
  });

  it('reports progress from the SDK to the caller', async () => {
    const { uploadGalleryMedia } = await loadStore();
    const onProgress = vi.fn();

    await uploadGalleryMedia(
      'media/abc.mp4',
      new ReadableStream(),
      'video/mp4',
      onProgress,
    );

    const [event, handler] = uploadOn.mock.calls[0] ?? [];
    expect(event).toBe('httpUploadProgress');
    (handler as (p: unknown) => void)({ loaded: 512, total: 2048 });
    expect(onProgress).toHaveBeenCalledWith({ loaded: 512, total: 2048 });
  });

  // The route turns a failure into an `error` event on its stream; swallowing
  // it here would report a successful upload that never happened.
  it('propagates an upload failure rather than swallowing it', async () => {
    uploadDone.mockRejectedValue(new Error('R2 rejected the request'));
    const { uploadGalleryMedia } = await loadStore();

    await expect(
      uploadGalleryMedia(
        'media/a.mp4',
        new ReadableStream(),
        'video/mp4',
        () => {},
      ),
    ).rejects.toThrow('R2 rejected the request');
  });
});
