import { getRedis } from "../../lib/redis.js";
import { requireSession } from "../../lib/auth.js";
import { newRequestId, jsonResponse } from "../../lib/request-id.js";
import { K, VALID_SOURCES } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

function csvField(v) {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function webHandler(request) {
  const reqId = newRequestId();
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "unauthorized" }, 401, reqId);
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, reqId);

  const url = new URL(request.url);
  const source = (url.searchParams.get("source") || "local").toLowerCase();
  if (!VALID_SOURCES.has(source)) return jsonResponse({ error: "bad_source" }, 400, reqId);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();

  const redis = getRedis();
  const hashes = await redis.zrange(K.index(source), 0, -1, { rev: true });

  const empty = hashes?.length
    ? null
    : { ct: format === "json" ? "application/json" : "text/csv", body: format === "json" ? "[]" : "" };
  if (empty) {
    return new Response(empty.body, {
      status: 200,
      headers: { "Content-Type": empty.ct, "Cache-Control": "no-store", "X-Request-Id": reqId },
    });
  }

  const [records, statuses] = await Promise.all([
    redis.mget(...hashes.map(h => K.lead(source, h))),
    redis.mget(...hashes.map(h => K.status(h))),
  ]);
  const merged = records.map((r, i) => r ? { ...r, _status: statuses[i] || "new" } : null).filter(Boolean);

  const date = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify(merged, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="leads-${source}-${date}.json"`,
        "Cache-Control": "no-store",
        "X-Request-Id": reqId,
      },
    });
  }

  const cols = ["hash","source","_status","date","name","address","city","area","phone","email","contact_email","website","business_type","lead_score","rating","reviews","issues"];
  const header = cols.join(",");
  const rows = merged.map(r => cols.map(c => csvField(c === "hash" ? r.hash || r._hash : r[c])).join(","));
  const csv = [header, ...rows].join("\n") + "\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${source}-${date}.csv"`,
      "Cache-Control": "no-store",
      "X-Request-Id": reqId,
    },
  });
}

export default toNodeHandler(webHandler);
