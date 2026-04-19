import bcrypt from "bcryptjs";
import { getRedis } from "../../lib/redis.js";
import { signSession, buildSessionCookie, SESSION_MAX_AGE } from "../../lib/auth.js";
import { newRequestId, log, jsonResponse } from "../../lib/request-id.js";
import { K } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

const MAX_ATTEMPTS = 5;            // 1..5 allowed (401 on wrong), 6+ blocked (429)
const WINDOW_SEC = 15 * 60;

export const config = { runtime: "nodejs" };

async function webHandler(request) {
  const reqId = newRequestId();
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, reqId);
  }

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || request.headers.get("x-real-ip") || "unknown";

  const redis = getRedis();
  const rlKey = K.rateLimit(ip);
  const fails = Number(await redis.get(rlKey)) || 0;
  if (fails >= MAX_ATTEMPTS) {
    log(reqId, `rate-limited ip=${ip} fails=${fails}`);
    return jsonResponse({ error: "rate_limited", retry_after: WINDOW_SEC }, 429, reqId);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "bad_json" }, 400, reqId); }

  if (body?.website) {
    log(reqId, `honeypot ip=${ip}`);
    return jsonResponse({ error: "invalid" }, 400, reqId);
  }

  const password = body?.password;
  if (!password || typeof password !== "string") {
    return jsonResponse({ error: "invalid" }, 400, reqId);
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    log(reqId, "FATAL: ADMIN_PASSWORD_HASH missing");
    return jsonResponse({ error: "server_misconfigured" }, 500, reqId);
  }

  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    const n = await redis.incr(rlKey);
    if (n === 1) await redis.expire(rlKey, WINDOW_SEC);
    log(reqId, `login fail ip=${ip} fails=${n}`);
    return jsonResponse({ error: "invalid" }, 401, reqId);
  }

  await redis.del(rlKey);
  const token = await signSession({ sub: "admin" }, "7d");
  log(reqId, `login ok ip=${ip}`);
  return jsonResponse(
    { ok: true },
    200,
    reqId,
    { "Set-Cookie": buildSessionCookie(token, SESSION_MAX_AGE) },
  );
}

export default toNodeHandler(webHandler);
