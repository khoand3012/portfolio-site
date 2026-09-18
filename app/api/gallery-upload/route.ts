import { randomUUID } from 'node:crypto';
import { auth } from '../../../auth';
import { isAdminAuthBypassed } from '../../../src/lib/adminAccess';
import { isAllowedEmail } from '../../../src/lib/allowedEmails';
import {
  galleryExtensionForType,
  maxBytesForType,
} from '../../../src/lib/galleryMediaTypes';
import { getMediaStore } from '../../../src/lib/mediaStore';
import {
  isR2Configured,
  type UploadProgress,
  uploadGalleryMedia,
} from '../../../src/lib/r2Store';

// A sibling of /api/upload rather than a branch inside it. The two differ in
// backend (R2 vs Netlify Blobs), size class (100MB vs 5MB), allow-list
// (video included vs images only) and return shape (an absolute public CDN
// URL vs a relative path this site serves). Nesting this under /api/upload
// would also force middleware.ts's matcher entry from the bare form to
// `:path*` — see the note in CLAUDE.md about why that entry is bare.
//
// A Route Handler, not a Server Action, for the reason the media-upload spec
// established: Next enforces a 1MB default body-size limit on Server Actions
// (`defaultBodySizeLimit`), which any video blows through.
//
// The request body is the raw file bytes, with the standard Content-Type
// header carrying the MIME type — no multipart parsing, and no filename
// reaching the server at all.

type Event =
  | { type: 'progress'; loaded: number; total?: number }
  | { type: 'done'; url: string }
  | { type: 'error'; message: string };

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Counts bytes as they pass and errors the stream past `max`.
 *
 * The Content-Length check below is a courtesy to an honest client: the
 * header is client-supplied and a chunked request omits it entirely. This is
 * the check that actually holds, and because it works on the stream it never
 * buffers the body to find out.
 */
function capped(
  body: ReadableStream<Uint8Array>,
  max: number,
): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          throw new Error(
            `That file is over ${Math.round(max / 1024 / 1024)}MB.`,
          );
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Local dev has no R2 credentials, so uploads land in the same Netlify
 * Blobs/filesystem store the avatar uses and are served back by
 * /api/media/<key>. This keeps the admin panel's upload button exercisable
 * without a provisioned bucket; production always takes the R2 branch.
 *
 * Buffering is acceptable *here* and nowhere else: this path only ever runs
 * on a developer's own machine.
 */
async function storeLocally(
  body: ReadableStream<Uint8Array>,
  key: string,
  contentType: string,
): Promise<string> {
  const bytes = await new Response(body).arrayBuffer();
  await getMediaStore().put(key, bytes, contentType);
  return `/api/media/${key}`;
}

export async function POST(request: Request): Promise<Response> {
  // Defense in depth, and an enforcement site in its own right (see
  // CLAUDE.md): middleware.ts gates this path too, but a Route Handler can be
  // POSTed to directly and must not trust that alone. The bypass is consulted
  // BEFORE auth(), because auth() throws outright when AUTH_SECRET is unset —
  // exactly the state of a machine running with OAuth disabled.
  if (!isAdminAuthBypassed()) {
    const session = await auth();
    if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
      return fail('Not authorized.', 403);
    }
  }

  const contentType = request.headers.get('content-type') ?? '';
  const extension = galleryExtensionForType(contentType);
  const maxBytes = maxBytesForType(contentType);
  if (!extension || maxBytes === null) {
    return fail(
      'Unsupported file type. Use PNG, JPEG, WebP, GIF, MP4 or WebM.',
      400,
    );
  }

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail(`That file is over ${maxBytes / 1024 / 1024}MB.`, 413);
  }

  if (!request.body) return fail('That file is empty.', 400);

  // A fresh UUID per upload, never a user-supplied name: the key can then
  // carry no traversal characters and can't collide with an existing object.
  const name = `${randomUUID()}.${extension}`;
  const body = capped(request.body, maxBytes);
  const useR2 = isR2Configured();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const url = useR2
          ? (
              await uploadGalleryMedia(
                `media/${name}`,
                body,
                contentType,
                (progress: UploadProgress) =>
                  send({ type: 'progress', ...progress }),
              )
            ).url
          : await storeLocally(body, name, contentType);
        send({ type: 'done', url });
      } catch (error) {
        // By now the 200 status line has already gone out, so a failure can
        // only be reported in-band. The client treats a stream that ends
        // without a `done` event as a failure, whatever the status said.
        console.error('Gallery upload failed', error);
        send({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not store that file. Try again.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  });
}
