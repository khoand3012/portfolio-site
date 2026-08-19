// Shared helpers for the Google-gated GitHub OAuth broker (netlify/functions/auth.mjs
// and callback.mjs). Protocol mirrors Decap/Sveltia CMS's expected OAuth popup
// handshake — see https://github.com/sveltia/sveltia-cms-auth for the reference
// implementation this is adapted from (same handshake, Google identity check
// substituted for GitHub's, plus an email allowlist).

// Only backend this broker serves — must match `backend.name` in admin/config.yml.
export const PROVIDER = 'github';

function serializeContent(content) {
  return JSON.stringify(content).replaceAll('<', '\\u003c');
}

// Renders the popup's response page. It performs the two-way postMessage
// handshake the CMS expects: wait for the opener to echo "authorizing:github"
// (which also reveals the opener's real, browser-verified origin), then reply
// with the final "authorization:github:success:{...}" (or ":error:{...}") message
// to that exact origin only.
export function outputHtml({ token, error, errorCode } = {}) {
  const state = error ? 'error' : 'success';
  const content = error ? { provider: PROVIDER, error, errorCode } : { provider: PROVIDER, token };

  const html = `<!doctype html><html><body><script>
(() => {
  window.addEventListener('message', ({ data, origin }) => {
    if (data !== 'authorizing:${PROVIDER}') return;
    window.opener?.postMessage('authorization:${PROVIDER}:${state}:${serializeContent(content)}', origin);
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
