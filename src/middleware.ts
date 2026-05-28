import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Protect the whole app. Unauthenticated users are bounced to /signin.
 * Public exceptions: the sign-in page, NextAuth's own endpoints, and the
 * cron-protected /api/sync (which authenticates via its own bearer secret).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/signin") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/sync") || // guarded by CRON_SECRET, not session
    pathname.startsWith("/api/health");

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
