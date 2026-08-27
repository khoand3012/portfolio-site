import { auth } from './auth';

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
