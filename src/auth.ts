import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { DEV_SKILLS, fetchSkills } from "@/lib/skills";

// Auth.js reports every OAuth misconfiguration as a generic "Server error". Say what is wrong instead.
if (process.env.NODE_ENV !== "production") {
  const id = process.env.AUTH_GITHUB_ID;
  const secret = process.env.AUTH_GITHUB_SECRET;
  if (!id || !secret) {
    console.warn("[auth] AUTH_GITHUB_ID / AUTH_GITHUB_SECRET are not set. GitHub sign-in will fail.");
  } else if (secret === id || !/^[0-9a-f]{40}$/.test(secret)) {
    console.warn(
      "[auth] AUTH_GITHUB_SECRET does not look like a GitHub client secret (expected 40 hex characters" +
        (secret === id ? "; it is identical to the client ID" : "") +
        "). Create one under your OAuth app > Client secrets, then restart the dev server.",
    );
  }
}

// Dev-only fake login for testing the paywall without a GitHub OAuth app.
const devLogin = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "1";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // read:user is the only scope: we read public repos once to learn the user's stack.
    GitHub({ authorization: { params: { scope: "read:user" } } }),
    ...(devLogin
      ? [
          Credentials({
            id: "dev",
            name: "Dev login",
            credentials: {},
            authorize: async () => ({ id: "dev-user", name: "Dev Student" }),
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // `account` is only present on the sign-in request.
      if (account?.provider === "github" && account.access_token && profile?.login) {
        token.login = String(profile.login);
        token.skills = (await fetchSkills(account.access_token, token.login).catch(() => null)) ?? undefined;
      } else if (account?.provider === "dev") {
        token.login = "dev-user";
        token.skills = DEV_SKILLS;
      }
      return token;
    },
    session({ session, token }) {
      session.login = token.login;
      session.skills = token.skills;
      return session;
    },
  },
});
