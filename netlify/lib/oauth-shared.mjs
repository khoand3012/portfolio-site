// Shared helpers for the Google-gated GitHub OAuth broker (netlify/functions/auth.mjs
// and callback.mjs). Protocol mirrors Decap/Sveltia CMS's expected OAuth popup
// handshake — see https://github.com/sveltia/sveltia-cms-auth for the reference
// implementation this is adapted from (same handshake, Google identity check
// substituted for GitHub's, plus an email allowlist).

// Only backend this broker serves — must match `backend.name` in admin/config.yml.
export const PROVIDER = 'github';

// The only origins a token may ever be relayed to. Without this check, any
// page could open our popup, wait for a legitimate editor to sign in inside
// it, then echo back the handshake message itself to steal the resulting
// GitHub token (the popup can't otherwise tell a genuine CMS opener from an
// attacker's window — see the message listener below). Keep this in sync
// with admin/config.yml's backend.base_url and the Google OAuth Client's
// Authorized redirect URIs if this site's domain ever changes.
const TRUSTED_ORIGINS = ['https://namtruong0307.netlify.app', 'http://localhost:8888'];

function serialize(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

// Renders the popup's response page. It performs the two-way postMessage
// handshake the CMS expects: wait for the opener to echo "authorizing:github"
// (which also reveals the opener's real, browser-verified origin — origin on
// a message event is set by the browser itself and can't be forged by the
// sender), then reply with the final "authorization:github:success:{...}"
// (or ":error:{...}") message — but only if that origin is one of ours, and
// only when the payload actually carries a token. Errors carry no secret, so
// they're relayed regardless, to keep the sign-in screen informative.
export function outputHtml({ token, error, errorCode } = {}) {
  const state = error ? 'error' : 'success';
  const content = error ? { provider: PROVIDER, error, errorCode } : { provider: PROVIDER, token };
  const hasToken = Boolean(token);

  const html = `<!doctype html><html><body><script>
(() => {
  const trustedOrigins = ${serialize(TRUSTED_ORIGINS)};
  const hasToken = ${serialize(hasToken)};
  window.addEventListener('message', ({ data, origin }) => {
    if (data !== 'authorizing:${PROVIDER}') return;
    if (hasToken && !trustedOrigins.includes(origin)) return;
    window.opener?.postMessage('authorization:${PROVIDER}:${state}:${serialize(content)}', origin);
  });
  window.opener?.postMessage('authorizing:${PROVIDER}', '*');
})();
</script></body></html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // Clear the CSRF cookie now that the flow (success or failure) is complete.
      'Set-Cookie': 'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure',
    },
  });
}

export function parseCookies(header) {
  const cookies = {};
  (header ?? '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    if (key) cookies[key] = part.slice(idx + 1).trim();
  });
  return cookies;
}

export function isEmailAllowed(email, allowedEmailsEnv) {
  const allowed = (allowedEmailsEnv ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes((email ?? '').trim().toLowerCase());
}
