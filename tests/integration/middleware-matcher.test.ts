/**
 * REM-10 rework regression tests: exercise the *actual* `matcher` regex Next.js compiles
 * from `src/middleware.ts`'s `config.matcher`, not just `authConfig.authorized()` in isolation.
 *
 * Background: the original matcher `(?!api|_next/static|_next/image|favicon.ico)` was a raw
 * literal-prefix negative lookahead, NOT bounded to a path segment. It excluded ANY path merely
 * starting with "api" (e.g. `/api-docs`, `/apiary`) from ever reaching the proxy/middleware at
 * all -- so `authorized()` was never even called for such paths, silently bypassing
 * protect-by-default. The existing auth.test.ts suite only ever called `authorized()` directly,
 * so it could not catch this: it never exercised the matcher regex that decides whether
 * `authorized()` runs in the first place. These tests close that gap by compiling the matcher
 * pattern the same way Next.js's proxy runtime does (via `path-to-regexp`) and asserting against
 * the resulting RegExp.
 */
import fs from "fs";
import path from "path";
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";

// `src/middleware.ts` itself cannot be `import`ed here: it calls `NextAuth(authConfig).auth`,
// which pulls in `@auth/core`'s ESM build and Jest cannot transform it (pre-existing, unrelated
// to this rework). Instead we read the real `config.matcher` value straight out of the source
// file, so this test still exercises the exact regex Next.js compiles from the shipped file --
// it just gets there without triggering the next-auth import chain.
function readMatcherFromMiddlewareSource(): string {
  const middlewareSource = fs.readFileSync(
    path.join(process.cwd(), "src", "middleware.ts"),
    "utf-8",
  );
  const match = middlewareSource.match(/matcher:\s*\[\s*"([^"]+)"\s*,?\s*\]/);
  if (!match) {
    throw new Error(
      'Could not locate `matcher: ["..."]` in src/middleware.ts -- update this test\'s parser if the config shape changed.',
    );
  }
  return match[1];
}

describe("REM-10 rework: middleware.ts matcher regex (not just authorized())", () => {
  const matcherSource = readMatcherFromMiddlewareSource();
  const matcherRegex = pathToRegexp(matcherSource);

  // "matches" here means the path passes the matcher's negative lookahead, i.e. the proxy DOES
  // run (and authorized() gets a chance to protect it). "does not match" means the proxy is
  // skipped entirely for that path -- true for genuine static assets / real API routes only.

  it("still excludes true /api/* routes from the proxy, so real API handlers keep managing their own auth", () => {
    // Real API routes must remain excluded from the page-protection proxy (they handle their
    // own auth internally); this guards against an overcorrection that re-includes them.
    expect(matcherRegex.test("/api/auth/register")).toBe(false);
    expect(matcherRegex.test("/api/applications/123/stage")).toBe(false);
  });

  it("no longer excludes a hypothetical future (main) page route that merely starts with the literal string 'api'", () => {
    // This is the core regression: before the fix, these matched the old unbounded "api"
    // literal-prefix lookahead and were silently excluded from the proxy (never protected).
    expect(matcherRegex.test("/api-usage-dashboard")).toBe(true);
    expect(matcherRegex.test("/apikeys")).toBe(true);
    expect(matcherRegex.test("/apiary")).toBe(true);
  });

  it("reaches the proxy for /api-docs, which now requires login (not in PUBLIC_ROUTES) plus an ADMIN-role page-level guard", () => {
    // Under the OLD matcher, /api-docs was (incorrectly, coincidentally) excluded by the same
    // unbounded "api" bug -- it happened to "work" for the wrong reason. It reaches the proxy
    // here regardless; the 011-audit-remediation follow-up additionally removed it from
    // PUBLIC_ROUTES (see auth.test.ts) so protect-by-default now requires login, and the page
    // component itself enforces the ADMIN-only guard (see src/app/api-docs/page.tsx).
    expect(matcherRegex.test("/api-docs")).toBe(true);
  });

  it("still excludes genuine static-asset paths (_next/static, _next/image, favicon.ico)", () => {
    expect(matcherRegex.test("/_next/static/chunks/main.js")).toBe(false);
    expect(matcherRegex.test("/_next/image")).toBe(false);
    expect(matcherRegex.test("/favicon.ico")).toBe(false);
  });

  it("reaches the proxy for /openapi.yaml (011-audit-remediation follow-up: no longer bypasses protect-by-default, so the raw spec can't be fetched while logged out now that /api-docs is ADMIN-gated)", () => {
    expect(matcherRegex.test("/openapi.yaml")).toBe(true);

    const openApiFilePath = path.join(process.cwd(), "public", "openapi.yaml");
    expect(fs.existsSync(openApiFilePath)).toBe(true);
  });
});
