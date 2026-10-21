import { handlers } from "@/lib/auth/auth";
import { NextRequest } from "next/server";

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

export const GET = (req: NextRequest) => {
  return handlers.GET(normalizeRequest(req));
};

export const POST = (req: NextRequest) => {
  return handlers.POST(normalizeRequest(req));
};


