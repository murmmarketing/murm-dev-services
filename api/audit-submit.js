// /api/audit-submit.js
//
// Serverless function that receives audit-form submissions from /audit
// and forwards them to a Telegram bot as a Markdown message.
//
// Accepts POST with either:
//   - application/json                  { url, email, notes }
//   - application/x-www-form-urlencoded url=...&email=...&notes=... (no-JS fallback)
//
// Env vars (required — set via Vercel dashboard or CLI; scope to Production):
//   vercel env add TELEGRAM_BOT_TOKEN production
//   vercel env add TELEGRAM_CHAT_ID production
//
// Rate limit: 5 submissions per IP per hour, in-memory (resets on cold start).
// CORS: rejects cross-origin requests (Origin must equal https://murmweb.dev).

import { Buffer } from "node:buffer";
import { newRequestId, log, jsonResponse } from "../lib/request-id.js";
import { toNodeHandler } from "../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

const ALLOWED_ORIGIN = "https://murmweb.dev";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;                    // per IP per window
const MAX_URL_LEN = 500;
const MAX_EMAIL_LEN = 200;
const MAX_NOTES_LEN = 2000;

// In-memory rate limiter. Cold starts reset it; acceptable for v1 (anti-spam, not hard security).
// { ip: number[] }  — timestamps within the window.
const rateBuckets = new Map();

function takeToken(ip, now) {
  const bucket = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  // Opportunistic cleanup so the Map does not grow unbounded on a warm instance.
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      const kept = v.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (kept.length === 0) rateBuckets.delete(k);
      else rateBuckets.set(k, kept);
    }
  }
  return true;
}

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isValidUrl(s) {
  return typeof s === "string" && /^https?:\/\/\S+$/i.test(s);
}

// Telegram legacy Markdown escapes: `_ * [ ` — escape inside user-supplied text so the message parses.
function escapeMarkdown(s) {
  return String(s).replace(/([_*\[`])/g, "\\$1");
}

function nlTimestamp(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

async function parseBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
  // Unknown content-type: attempt JSON as a last resort; return null if it fails.
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function webHandler(request) {
  const reqId = newRequestId();

  // Method gate first — cheapest rejection, avoids parsing bodies for wrong methods.
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, reqId, { Allow: "POST" });
  }

  // CORS: reject any cross-origin request. Absent Origin is permitted (same-origin navigations
  // and curl without -H Origin) — browser attacks would always send Origin, so this is safe.
  const origin = request.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) {
    log(reqId, "reject: bad origin", origin);
    return jsonResponse({ ok: false, error: "forbidden" }, 403, reqId);
  }

  // Env vars required.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log(reqId, "reject: missing telegram env vars");
    return jsonResponse({ ok: false, error: "server_misconfigured" }, 500, reqId);
  }

  // Rate limit per IP.
  const ip = clientIp(request);
  if (!takeToken(ip, Date.now())) {
    log(reqId, "reject: rate limit", ip);
    return jsonResponse({ ok: false, error: "too_many_requests" }, 429, reqId, {
      "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
    });
  }

  // Body.
  const body = await parseBody(request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ ok: false, error: "bad_request" }, 400, reqId);
  }

  // Honeypot: a hidden field real users never fill. Any value = bot.
  if (body.website_extra) {
    log(reqId, "reject: honeypot tripped", { ip });
    return jsonResponse({ ok: false, error: "bad_request" }, 400, reqId);
  }

  const url = String(body.url || "").trim().slice(0, MAX_URL_LEN);
  const email = String(body.email || "").trim().slice(0, MAX_EMAIL_LEN);
  const notes = String(body.notes || "").trim().slice(0, MAX_NOTES_LEN);

  if (!isValidUrl(url)) {
    return jsonResponse({ ok: false, error: "invalid_url" }, 400, reqId);
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: "invalid_email" }, 400, reqId);
  }

  const text = [
    "🎯 New audit request",
    "",
    `*URL:* ${escapeMarkdown(url)}`,
    `*Email:* ${escapeMarkdown(email)}`,
    `*Notes:* ${notes ? escapeMarkdown(notes) : "—"}`,
    "",
    `_${escapeMarkdown(nlTimestamp())}_`,
  ].join("\n");

  // Deliver to Telegram. Keep the upstream error out of the client response.
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!tgRes.ok) {
      const detail = await tgRes.text().catch(() => "");
      log(reqId, "telegram non-2xx", tgRes.status, detail.slice(0, 400));
      return jsonResponse({ ok: false, error: "delivery failed" }, 500, reqId);
    }
  } catch (err) {
    log(reqId, "telegram fetch threw", err?.message || err);
    return jsonResponse({ ok: false, error: "delivery failed" }, 500, reqId);
  }

  log(reqId, "delivered", { ip, email });

  // If the submission arrived as a classic form POST (no-JS fallback), a JSON body would
  // leave the user staring at `{"ok":true}`. Redirect them back to /audit#thanks instead.
  const accept = (request.headers.get("accept") || "").toLowerCase();
  const isClassicForm = (request.headers.get("content-type") || "").includes("application/x-www-form-urlencoded")
    && !accept.includes("application/json");
  if (isClassicForm) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/audit?ok=1#thanks", "X-Request-Id": reqId },
    });
  }

  return jsonResponse({ ok: true }, 200, reqId);
}

export default toNodeHandler(webHandler);
