import { auth } from './auth';

export default auth((req) => {
  const isProtected = req.nextUrl.pathname.startsWith('/admin');
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
  matcher: ['/admin', '/admin/:path*'],
};
