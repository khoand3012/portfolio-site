import { randomUUID } from 'node:crypto';
import { auth } from '../../../auth';
import { isAdminAuthBypassed } from '../../../src/lib/adminAccess';
import { isAllowedEmail } from '../../../src/lib/allowedEmails';
import { getMediaStore } from '../../../src/lib/mediaStore';
import {
  extensionForType,
  MAX_AVATAR_BYTES,
} from '../../../src/lib/mediaTypes';

// A Route Handler, not a Server Action, for the reason the media-upload spec
// already established: Next enforces its own 1MB default body-size limit on
// Server Actions (`defaultBodySizeLimit` in next/dist/server/app-render/
// action-handler.js), which a photo straight off a phone blows through.
// Route Handlers have no equivalent built-in cap.
//
// The request body is the raw file bytes, with the standard Content-Type
// header carrying the MIME type — no multipart parsing, and no filename
// reaching the server at all.
export async function POST(request: Request): Promise<Response> {
  // Defense in depth, and a sixth enforcement site in its own right (see
  // CLAUDE.md): middleware.ts gates this path too, but a Route Handler must
  // not trust that alone. The bypass is consulted BEFORE auth() — same
  // ordering as every other layer, because auth() throws outright when
  // AUTH_SECRET is unset, which is exactly the state of a machine running
  // with OAuth disabled.
  if (!isAdminAuthBypassed()) {
    const session = await auth();
    if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
      return Response.json({ error: 'Not authorized.' }, { status: 403 });
    }
  }

  const extension = extensionForType(request.headers.get('content-type') ?? '');
  if (!extension) {
    return Response.json(
      { error: 'Unsupported image type. Use PNG, JPEG, WebP or GIF.' },
      { status: 400 },
    );
  }

  // A cheap early rejection for the ordinary browser case, where fetch sets
  // Content-Length from the File. It is NOT a guarantee: the header is
  // client-supplied and a chunked request omits it entirely, in which case
  // the body below is buffered in full before the size is known. The
  // authoritative check is the byte-length one after the read — this one
  // only saves the round trip when the client is honest.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) {
    return Response.json({ error: 'That image is over 5MB.' }, { status: 413 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return Response.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return Response.json({ error: 'That image is over 5MB.' }, { status: 413 });
  }

  // A fresh UUID per upload, never a user-supplied name: the key can then
  // carry no traversal characters and can't collide with an existing object.
  // It also makes the served URL immutable, which is what lets app/api/media
  // set an aggressive Cache-Control.
  const key = `${randomUUID()}.${extension}`;
  const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  try {
    await getMediaStore().put(key, bytes, contentType);
  } catch (error) {
    console.error('Avatar upload failed', error);
    return Response.json(
      { error: 'Could not store that image. Try again.' },
      { status: 500 },
    );
  }

  // A relative path rather than an absolute URL: the site is served from
  // different origins (netlify.app, a custom domain, localhost) and a stored
  // absolute URL would pin the avatar to whichever one happened to be
  // serving /admin at upload time.
  return Response.json({ url: `/api/media/${key}` });
}
