import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/authConfig";

export default NextAuth(authConfig).auth;

export const config = {
  // Protect routes while letting Next.js static files, public images, and auth APIs bypass
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
