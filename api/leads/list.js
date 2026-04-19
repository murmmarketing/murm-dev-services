import { getRedis } from "../../lib/redis.js";
import { requireSession } from "../../lib/auth.js";
import { newRequestId, jsonResponse } from "../../lib/request-id.js";
import { K, VALID_SOURCES } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

async function webHandler(request) {
  const reqId = newRequestId();
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "unauthorized" }, 401, reqId);
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, reqId);

  const url = new URL(request.url);
  const source = (url.searchParams.get("source") || "local").toLowerCase();
  if (!VALID_SOURCES.has(source)) return jsonResponse({ error: "bad_source" }, 400, reqId);

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const q = (url.searchParams.get("q") || "").toLowerCase().trim();
  const statusFilter = url.searchParams.get("status");
  const cityFilter = url.searchParams.get("city");
  const typeFilter = url.searchParams.get("type");
  const minScore = Number(url.searchParams.get("min_score")) || 0;

  const redis = getRedis();
  const hashes = await redis.zrange(K.index(source), 0, -1, { rev: true });
  if (!hashes?.length) {
    return jsonResponse({ leads: [], total: 0, page, limit, source }, 200, reqId);
  }

  const [records, statuses] = await Promise.all([
    redis.mget(...hashes.map(h => K.lead(source, h))),
    redis.mget(...hashes.map(h => K.status(h))),
  ]);

  let rows = records.map((rec, i) => rec
    ? { ...rec, _status: statuses[i] || "new", _hash: hashes[i] }
    : null).filter(Boolean);

  if (q) {
    rows = rows.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.area || r.city || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.email || r.contact_email || "").toLowerCase().includes(q));
  }
  if (statusFilter) rows = rows.filter(r => r._status === statusFilter);
  if (cityFilter) rows = rows.filter(r => (r.area || r.city) === cityFilter);
  if (typeFilter) rows = rows.filter(r => r.business_type === typeFilter);
  if (minScore) rows = rows.filter(r => Number(r.lead_score || 0) >= minScore);

  const total = rows.length;
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);

  return jsonResponse({
    leads: paged,
    total,
    page,
    limit,
    source,
    filters: { q, status: statusFilter, city: cityFilter, type: typeFilter, min_score: minScore },
  }, 200, reqId);
}

export default toNodeHandler(webHandler);
