import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "spyne.ai";

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export type AppRole = "CSM" | "ADMIN";

function roleForEmail(email: string): AppRole {
  return ADMIN_EMAILS.has(email.toLowerCase()) ? "ADMIN" : "CSM";
}

function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Ask Google to pre-filter to the workspace domain. This is a UX hint;
      // the real enforcement is the signIn callback below.
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    // Hard gate: only @<domain> emails may sign in. Anything else is rejected.
    signIn({ profile, user }) {
      const email = (profile?.email ?? user?.email)?.toString();
      return isAllowed(email);
    },
    jwt({ token }) {
      if (token.email) token.role = roleForEmail(token.email);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AppRole) ?? "CSM";
      }
      return session;
    },
  },
});

export { roleForEmail, isAllowed, ALLOWED_DOMAIN };
