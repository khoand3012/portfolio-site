import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from './src/lib/allowedEmails';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js's default for `trustHost` is
  // `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production')`
  // (@auth/core/lib/utils/env.js). None of those env vars are set on Netlify
  // production, so without this the default is `false` and Auth.js rejects
  // every request as an untrusted host (@auth/core/lib/utils/assert.js)
  // before it even checks the secret.
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email, process.env.ALLOWED_EMAILS);
    },
  },
});
