import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(_req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// Protect everything except: auth routes, login page, static assets, health
export const config = {
  matcher: [
    "/((?!api/auth|api/health|api/webhooks|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
