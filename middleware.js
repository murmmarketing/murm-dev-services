// Middleware is intentionally scoped to the /admin/* UI only.
//
// API routes handle auth internally via requireSession() (cookie) or bearer
// token comparison. Including them here is redundant AND triggers a
// `vercel dev` body-stream stall on PATCH requests with bodies. Middleware
// exists only to redirect unauthed /admin/* UI requests to /admin/login.
import { jwtVerify } from "jose";

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
  ],
};

const PUBLIC_PATHS = new Set([
  "/admin/login",
  "/admin/login.html",
  "/admin/legacy",
  "/admin/legacy.html",
]);

function getCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (PUBLIC_PATHS.has(path)) return;

  const cookieName = process.env.AUTH_COOKIE_NAME || "murm_admin_session";
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = getCookie(request.headers.get("cookie"), cookieName);

  let valid = false;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      valid = true;
    } catch { /* invalid or expired */ }
  }

  if (valid) return;

  const loginUrl = new URL("/admin/login", request.url);
  return Response.redirect(loginUrl.toString(), 302);
}
