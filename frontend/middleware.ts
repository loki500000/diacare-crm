import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, Next.js internals, and API routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));

    // Check expiry
    if (!payload.exp || payload.exp < Date.now()) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
      return res;
    }

    // Settings page: super admin only
    if (pathname.startsWith("/settings") && payload.role !== "superadmin") {
      return NextResponse.redirect(new URL("/triage", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
