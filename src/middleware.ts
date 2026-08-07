import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/authConfig";

export default NextAuth(authConfig).auth;

export const config = {
  // Protect routes while letting Next.js static files and public images bypass. REM-10 rework:
  // `api` alone was an unbounded literal prefix match (matched `/apiary`, `/api-docs`, etc, not
  // just true `/api/*` routes) which would silently exempt any future page route merely starting
  // with "api" from protect-by-default. `api/` bounds the exclusion to the actual /api/* route
  // segment.
  //
  // 011-audit-remediation follow-up: `/api-docs` is now ADMIN-gated at the page level (it
  // documents admin-only endpoints), so `/openapi.yaml` -- the raw spec file it renders, served
  // statically from `public/` -- must no longer bypass this proxy either; otherwise anyone
  // logged out could fetch the spec directly without ever going through the gated page. Dropping
  // it from the exclusion list lets it fall through to protect-by-default (login required via
  // PUBLIC_ROUTES, same as any other non-API route). It does not get an ADMIN-role check here --
  // this app's pattern keeps role checks at the page/route level, not in this matcher/authorized()
  // callback -- but login-required is enough to close the "trivially fetchable while logged out"
  // gap, and it reuses the existing static file under public/ rather than standing up a new
  // authenticated API route for it.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
