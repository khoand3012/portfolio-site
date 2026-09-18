// src/lib/r2Store.ts
//
// Cloudflare R2 (S3-compatible) storage for gallery media, deliberately a
// THIRD storage module rather than a widening of either existing one:
//
//   blobStore.ts  — JSON content, by construction (setJSON/JSON.parse).
//   mediaStore.ts — the hero avatar: `put(key, bytes: ArrayBuffer, …)`, fed
//                   by `await request.arrayBuffer()` and capped at 5MB.
//   here          — gallery media up to 100MB, taking a ReadableStream.
//
// That last difference is the forcing one. Buffering a 100MB video into an
// ArrayBuffer inside a serverless function is exactly what this interface
// exists to avoid, so it cannot reuse mediaStore's signature — `request.body`
// goes straight into @aws-sdk/lib-storage's `Upload`, which also emits the
// progress events the route streams back to the browser.
//
// Why R2 and not Netlify Blobs, which needs no new credentials: video off a
// public CDN is the case Blobs isn't built for. See
// docs/superpowers/specs/2026-08-28-admin-media-upload-design.md.

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface UploadProgress {
  loaded: number;
  total?: number;
}

const REQUIRED_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const;

/**
 * All five or nothing. A half-configured environment is the dangerous state:
 * it would build a client that fails at request time, rather than letting the
 * caller fall back to local storage while the owner finishes provisioning.
 */
export function isR2Configured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

function requireEnv(name: (typeof REQUIRED_VARS)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    // R2 exposes one S3 endpoint per account, derived from the account id —
    // it is not a separate variable.
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    // R2 ignores the region but the SDK requires one.
    region: 'auto',
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

/**
 * Streams `body` into the bucket under `key` and returns the URL the public
 * page will use. That URL is built from `R2_PUBLIC_URL` — the bucket's
 * public hostname — never from the S3 API endpoint, which is credentialed
 * and not publicly readable.
 */
export async function uploadGalleryMedia(
  key: string,
  body: ReadableStream,
  contentType: string,
  onProgress: (progress: UploadProgress) => void,
): Promise<{ url: string }> {
  const upload = new Upload({
    client: client(),
    params: {
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  });

  upload.on('httpUploadProgress', (progress) => {
    onProgress({ loaded: progress.loaded ?? 0, total: progress.total });
  });

  // No try/catch: a failure must reach the route, which turns it into an
  // `error` event on its response stream. Swallowing it here would report a
  // successful upload that never happened.
  await upload.done();

  const base = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return { url: `${base}/${key}` };
}
