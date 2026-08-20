// Step 2 of the OAuth popup flow: Google redirects back here with a `code`.
// We exchange it for the signed-in user's verified email, check it against
// ALLOWED_EMAILS, and — only if it matches — hand the CMS a GitHub token that
// can write to this repo. The editor never sees or needs a GitHub account.

import {
  isEmailAllowed,
  outputHtml,
  PROVIDER,
  parseCookies,
} from '../lib/oauth-shared.ts';

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const cookies = parseCookies(req.headers.get('cookie'));
  const match = (cookies['csrf-token'] ?? '').match(
    /^([a-z]+)_([0-9a-f]{32})$/,
  );
  const [, cookieProvider, csrfToken] = match ?? [];

  if (!cookieProvider || cookieProvider !== PROVIDER) {
    return outputHtml({
      error: 'Unsupported Git backend.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  if (!code || !state) {
    return outputHtml({
      error: 'Did not receive an authorization code. Please try again.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    });
  }

  if (!csrfToken || state !== csrfToken) {
    return outputHtml({
      error: 'Potential CSRF attack detected. Authentication flow aborted.',
      errorCode: 'CSRF_DETECTED',
    });
  }

  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GITHUB_TOKEN,
    ALLOWED_EMAILS,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GITHUB_TOKEN) {
    return outputHtml({
      error: 'Server is not configured correctly.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  let tokenRes: Response;

  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${url.origin}/api/callback`,
        grant_type: 'authorization_code',
      }),
    });
  } catch {
    return outputHtml({
      error: 'Failed to reach Google. Please try again later.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    });
  }

  const tokenData: GoogleTokenResponse | null = await tokenRes
    .json()
    .catch(() => null);

  if (!tokenRes.ok || !tokenData?.id_token) {
    return outputHtml({
      error: 'Google sign-in failed. Please try again.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    });
  }

  // Verify the ID token via Google's tokeninfo endpoint rather than checking the
  // JWT signature locally — no crypto/JWK dependency needed, and the traffic
  // volume here (a handful of logins) is well within what this endpoint is for.
  let info: GoogleTokenInfo;

  try {
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`,
    );

    info = await infoRes.json();
    if (!infoRes.ok) throw new Error('invalid id_token');
  } catch {
    return outputHtml({
      error: 'Could not verify your Google identity. Please try again.',
      errorCode: 'MALFORMED_RESPONSE',
    });
  }

  // `aud` must match our own client ID — otherwise a token issued for some other
  // app could be replayed here.
  if (info.aud !== GOOGLE_CLIENT_ID || info.email_verified !== 'true') {
    return outputHtml({
      error: 'Could not verify your Google identity. Please try again.',
      errorCode: 'MALFORMED_RESPONSE',
    });
  }

  if (!isEmailAllowed(info.email, ALLOWED_EMAILS)) {
    return outputHtml({
      error: `The email ${info.email} is not authorized to edit this site.`,
      errorCode: 'UNSUPPORTED_DOMAIN',
    });
  }

  return outputHtml({ token: GITHUB_TOKEN });
};

export const config = { path: '/api/callback' };
