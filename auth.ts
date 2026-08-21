import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from './src/lib/allowedEmails';

export const { handlers, auth, signIn, signOut } = NextAuth({
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
