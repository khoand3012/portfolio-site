// Step 1 of the OAuth popup flow: the CMS opens a popup here, we redirect it to
// Google's consent screen instead of GitHub's. See netlify/lib/oauth-shared.ts
// for the shared protocol notes.

import { randomUUID } from 'node:crypto';
import { outputHtml, PROVIDER } from '../lib/oauth-shared.ts';

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');

  if (provider !== PROVIDER) {
    return outputHtml({
      error: 'Unsupported Git backend.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  const { GOOGLE_CLIENT_ID } = process.env;

  if (!GOOGLE_CLIENT_ID) {
    return outputHtml({
      error: 'Google OAuth client is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  // CSRF token: stored in an HttpOnly cookie now, and passed as Google's `state`
  // param so we can confirm the callback request actually followed from this
  // redirect (not a forged request with a stolen/guessed code).
  const csrfToken = randomUUID().replaceAll('-', '');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/callback`,
    response_type: 'code',
    scope: 'openid email',
    state: csrfToken,
    prompt: 'select_account',
  });

  return new Response('', {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'Set-Cookie':
        `csrf-token=${PROVIDER}_${csrfToken}; ` +
        `HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
    },
  });
};

export const config = { path: '/api/auth' };
