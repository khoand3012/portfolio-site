// src/lib/galleryUploadClient.ts
//
// The browser half of a gallery upload. Kept out of the React component so
// the protocol — two progress legs, newline-delimited JSON, and the several
// ways an upload can fail — is testable without rendering anything.
//
// XMLHttpRequest, not fetch: `fetch` exposes no upload progress, and the
// browser→server leg is the one that takes the time on a large file.

import {
  GALLERY_TYPES,
  galleryExtensionForType,
  maxBytesForType,
} from './galleryMediaTypes';

export const UPLOAD_PATH = '/api/gallery-upload';

export type UploadPhase =
  /** Browser → server, driven by xhr.upload.onprogress. */
  | 'sending'
  /** Server → R2, driven by the NDJSON events the route streams back. */
  | 'storing';

export interface UploadProgressEvent {
  phase: UploadPhase;
  loaded: number;
  total?: number;
}

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

interface Handlers {
  onProgress?: (progress: UploadProgressEvent) => void;
}

/** Consumes whole newline-delimited JSON lines, leaving any partial tail. */
function takeLines(buffer: string): { lines: unknown[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  const lines: unknown[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    try {
      lines.push(JSON.parse(part));
    } catch {
      // A line the server didn't finish writing, or noise from a non-JSON
      // response. Skipping it is right: the absence of a `done` event is what
      // makes the upload fail, not a parse error here.
    }
  }
  return { lines, rest };
}

export function uploadGalleryFile(
  file: Blob & { type: string },
  handlers: Handlers = {},
  createXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<UploadResult> {
  // Checked here purely so the owner gets an instant answer instead of
  // waiting out an upload the route will refuse. The route's own checks are
  // the authoritative ones — this is convenience, not a boundary.
  if (!galleryExtensionForType(file.type)) {
    return Promise.resolve({
      ok: false,
      message: `Use one of: ${Object.values(GALLERY_TYPES).join(', ')}.`,
    });
  }
  const cap = maxBytesForType(file.type);
  if (cap !== null && file.size > cap) {
    return Promise.resolve({
      ok: false,
      message: `That file is over ${cap / 1024 / 1024}MB.`,
    });
  }

  return new Promise<UploadResult>((resolve) => {
    const xhr = createXhr();
    let settled = false;
    const settle = (result: UploadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let consumed = 0;
    let buffer = '';
    let outcome: UploadResult | null = null;

    const drain = () => {
      buffer += xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      const { lines, rest } = takeLines(buffer);
      buffer = rest;

      for (const line of lines) {
        const event = line as Record<string, unknown>;
        if (event.type === 'progress') {
          handlers.onProgress?.({
            phase: 'storing',
            loaded: Number(event.loaded ?? 0),
            total: typeof event.total === 'number' ? event.total : undefined,
          });
        } else if (event.type === 'done' && typeof event.url === 'string') {
          outcome = { ok: true, url: event.url };
        } else if (event.type === 'error') {
          outcome = {
            ok: false,
            message:
              typeof event.message === 'string'
                ? event.message
                : 'Upload failed. Try again.',
          };
        }
      }
    };

    xhr.open('POST', UPLOAD_PATH);
    // The raw bytes, with the standard header carrying the type — no
    // multipart form, so no filename ever reaches the server.
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event: ProgressEvent) => {
      handlers.onProgress?.({
        phase: 'sending',
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : undefined,
      });
    };

    xhr.onprogress = drain;

    xhr.onload = () => {
      // XHR follows redirects transparently and offers no `redirect:
      // 'manual'`, so middleware's 302 to the sign-in page arrives here as a
      // 200 of HTML — indistinguishable from success by status alone. Only
      // responseURL reveals it. (AvatarField solves the same problem with
      // fetch's `opaqueredirect`; this is the XHR analogue.)
      if (xhr.responseURL && !xhr.responseURL.endsWith(UPLOAD_PATH)) {
        settle({
          ok: false,
          message: 'Your sign-in expired. Reload the page and sign in again.',
        });
        return;
      }

      if (xhr.status >= 400) {
        let message = 'Upload failed. Try again.';
        try {
          const payload = JSON.parse(xhr.responseText);
          if (typeof payload?.error === 'string') message = payload.error;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        settle({ ok: false, message });
        return;
      }

      drain();
      // A stream that ended without a `done` event failed, whatever the
      // status said: the status line went out before the upload was even
      // attempted, so it can't carry the outcome.
      settle(
        outcome ?? {
          ok: false,
          message: 'Upload did not complete. Try again.',
        },
      );
    };

    xhr.onerror = () =>
      settle({
        ok: false,
        message: 'Upload failed. Check your connection and try again.',
      });
    xhr.onabort = () => settle({ ok: false, message: 'Upload cancelled.' });

    xhr.send(file);
  });
}
