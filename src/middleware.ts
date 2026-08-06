import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/authConfig";

export default NextAuth(authConfig).auth;

export const config = {
  // Protect routes while letting Next.js static files, public images, auth APIs, and the
  // publicly-served OpenAPI spec bypass. REM-10 rework: `api` alone was an unbounded literal
  // prefix match (matched `/apiary`, `/api-docs`, etc, not just true `/api/*` routes) which
  // would silently exempt any future page route merely starting with "api" from protect-by-
  // default. `api/` bounds the exclusion to the actual /api/* route segment.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|openapi\.yaml).*)"],
};
