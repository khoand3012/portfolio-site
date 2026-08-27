import { auth } from './auth';

// This file deliberately does NOT export `runtime = 'nodejs'`. At the
// installed next@15.5.23, middleware runs in the Edge Runtime by default;
// Node.js middleware is a stable *opt-in* via a top-level
// `export const runtime = 'nodejs'` (not a `config.runtime` key — the
// schema Next validates `config` against, MiddlewareConfigInputSchema in
// next/dist/build/segment-config/middleware/middleware-config.js, only
// recognizes `matcher` / `regions` / `unstable_allowDynamic`). Edge Runtime
// stops being the default only at Next.js 16 (file renamed to proxy.ts).
//
// A clean `npm run build` (rm -rf .next first — an incremental build
// silently suppresses these) emits two warnings from this import chain:
//   ./node_modules/jose/dist/webapi/lib/deflate.js
//   (CompressionStream at line 10, DecompressionStream at line 26)
//   -> jwe_decrypt.js -> jwt/decrypt.js -> @auth/core/jwt.js -> ... -> ./auth.ts
// Both APIs are in Next's own EDGE_UNSUPPORTED_NODE_APIS list
// (next/dist/shared/lib/constants.js), which is why the bundler flags them.
// They are confirmed NOT reachable here: jose only calls compress()/
// decompress() when a JWE's protected header has `zip: 'DEF'`
// (node_modules/jose/dist/webapi/lib/jwe_decrypt.js:148), and @auth/core's
// own encode() (node_modules/@auth/core/jwt.js) never sets that header when
// it issues this app's session tokens. The AEAD auth-tag check also runs
// *before* the zip check in that same function, so a forged cookie can't
// reach compress/decompress without already possessing AUTH_SECRET — at
// which point the attacker already owns the session store outright.
//
// Don't "fix" this by adding `export const runtime = 'nodejs'`. Netlify's
// @netlify/plugin-nextjs (5.15.13) does not run Node-runtime middleware as
// a real Node process: copyHandlerDependenciesForNodeMiddleware
// (node_modules/@netlify/plugin-nextjs/dist/build/functions/edge.js) inlines
// every traced dependency into a virtual CJS filesystem and executes it
// inside a Netlify *Edge* Function via a Node compatibility shim — a
// heavier, less-exercised deploy path that can't be verified in this repo's
// build/test tooling. Swapping it in would trade a provably-harmless build
// warning for an unverified change to the sole auth gate in front of
// /admin and /api/puck. See
// .superpowers/sdd/2026-08-20-nextjs-puck-admin-panel/task-20-edge-runtime-report.md
// for the full investigation.
export default auth((req) => {
  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') ||
    req.nextUrl.pathname.startsWith('/api/puck');
  if (isProtected && !req.auth) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  // The brief's draft used only '/admin/:path*', which does NOT match the bare
  // '/admin' path itself in Next.js's matcher (path-to-regexp ':path*' requires
  // at least the leading '/admin/' segment separator to be present beyond the
  // base). app/admin/page.tsx is reachable at exactly '/admin', so without this
  // explicit entry an unauthenticated request could reach that route without
  // middleware ever running. See https://github.com/vercel/next.js/discussions/62032.
  //
  // No equivalent bare '/api/puck' entry is needed: app/api/puck/[...all]/route.ts
  // is a non-optional catch-all ([...all], not [[...all]]), so a bare '/api/puck'
  // request 404s before any routing/matcher logic runs — there's no gap the way
  // there was for '/admin'.
  matcher: ['/admin', '/admin/:path*', '/api/puck/:path*'],
};
