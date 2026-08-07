import type { NextAuthConfig } from "next-auth";

// REM-10: allowlist of every actual public page. middleware.ts's matcher config
// (see src/middleware.ts) already excludes /api/*, /_next/static, /_next/image, and
// favicon.ico before a request ever reaches this callback, so those don't need to be
// listed here. Everything NOT in this list is protected by default (protect-by-default) -
// a new route added under (main) needs zero additional change here to be protected.
export const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export const authConfig: NextAuthConfig = {
  providers: [], // Added in auth.ts to avoid middleware Edge compatibility limitations
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicRoute = PUBLIC_ROUTES.includes(nextUrl.pathname);

      if (isPublicRoute) {
        if (
          isLoggedIn &&
          (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")
        ) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Protect-by-default: any route not in PUBLIC_ROUTES requires auth.
      return isLoggedIn; // false redirects unauthenticated users to the sign-in page
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
