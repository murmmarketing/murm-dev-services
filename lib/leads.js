import { createHash } from "node:crypto";

export function normalizePhone(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+31")) s = "0" + s.slice(3);
  if (s.startsWith("0031")) s = "0" + s.slice(4);
  return s;
}

export function normalizeAddress(raw) {
  return String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function leadHash({ source, name, phone, address }) {
  const input = [
    String(source || "").toLowerCase().trim(),
    String(name || "").toLowerCase().trim(),
    normalizePhone(phone),
    normalizeAddress(address),
  ].join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function contentHash(obj) {
  return createHash("sha256").update(stableStringify(obj)).digest("hex").slice(0, 16);
}

export const VALID_SOURCES = new Set(["local", "shopify", "demos"]);
export const VALID_STATUS = new Set(["new", "contacted", "replied", "booked", "won", "lost"]);

export const K = {
  lead: (source, hash) => `leads:${source}:${hash}`,
  index: (source) => `leads:index:${source}`,
  status: (hash) => `leads:status:${hash}`,
  notes: (hash) => `leads:notes:${hash}`,
  lastSync: () => `leads:meta:last_sync`,
  weekStats: () => `leads:meta:week_stats`,
  rateLimit: (ip) => `auth:fails:${ip}`,
};
