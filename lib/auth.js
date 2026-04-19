import { SignJWT, jwtVerify } from "jose";

const DEFAULT_COOKIE = "murm_admin_session";
const SESSION_MAX_AGE_SEC = 7 * 24 * 3600;
const SLIDING_REFRESH_WINDOW_SEC = 24 * 3600;

export function cookieName() {
  return process.env.AUTH_COOKIE_NAME || DEFAULT_COOKIE;
}

function secretKey() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET not set");
  return new TextEncoder().encode(s);
}

export async function signSession(payload, expiresIn = "7d") {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export function buildSessionCookie(token, maxAgeSec = SESSION_MAX_AGE_SEC) {
  return [
    `${cookieName()}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return `${cookieName()}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function getCookie(headerValue, name) {
  if (!headerValue) return null;
  for (const part of headerValue.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function requireSession(request) {
  const token = getCookie(request.headers.get("cookie"), cookieName());
  return await verifySession(token);
}

export function shouldRefresh(payload) {
  if (!payload?.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp - nowSec < SLIDING_REFRESH_WINDOW_SEC;
}

export const SESSION_MAX_AGE = SESSION_MAX_AGE_SEC;
