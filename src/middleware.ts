import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/authConfig";
import { NextRequest, NextFetchEvent } from "next/server";

const { auth: nextAuthMiddleware } = NextAuth(authConfig);

function normalizeRequest(req: NextRequest): NextRequest {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return req;
  const proto = req.headers.get("x-forwarded-proto") || (req.url.startsWith("https") ? "https" : "http");
  const targetOrigin = `${proto}://${host}`;
  const currentOrigin = req.nextUrl.origin;
  if (currentOrigin !== targetOrigin) {
    const newHref = req.nextUrl.href.replace(currentOrigin, targetOrigin);
    return new NextRequest(newHref, req);
  }
  return req;
}

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  return (nextAuthMiddleware as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response> | Response)(
    normalizeRequest(req),
    ev,
  );
}


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
