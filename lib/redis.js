import { Redis } from "@upstash/redis";

let _client;

// Vercel Marketplace's Upstash integration uses the UPSTASH_REDIS_KV_REST_API_*
// naming. Fall back to the canonical UPSTASH_REDIS_REST_* names for portability.
export function getRedis() {
  if (_client) return _client;
  const url = process.env.UPSTASH_REDIS_KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash env vars missing: need UPSTASH_REDIS_KV_REST_API_URL + _TOKEN "
      + "(Marketplace) or UPSTASH_REDIS_REST_URL + _TOKEN (canonical)"
    );
  }
  _client = new Redis({ url, token });
  return _client;
}
