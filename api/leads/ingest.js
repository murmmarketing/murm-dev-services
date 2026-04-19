import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { getRedis } from "../../lib/redis.js";
import { newRequestId, log, jsonResponse } from "../../lib/request-id.js";
import { leadHash, contentHash, K, VALID_SOURCES } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

const MAX_BATCH = 500;

export const config = { runtime: "nodejs" };

function checkBearer(request) {
  const expected = process.env.LEADS_API_TOKEN;
  if (!expected) return { ok: false, reason: "server_misconfigured" };
  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return { ok: false, reason: "unauthorized" };
  try {
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "unauthorized" };
  } catch {
    return { ok: false, reason: "unauthorized" };
  }
}

function stripMeta(obj) {
  const { hash, ingested_at, ...rest } = obj;
  return rest;
}

async function webHandler(request) {
  const reqId = newRequestId();
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, reqId);
  }

  const auth = checkBearer(request);
  if (!auth.ok) {
    log(reqId, `ingest denied: ${auth.reason}`);
    return jsonResponse({ error: auth.reason }, auth.reason === "server_misconfigured" ? 500 : 401, reqId);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "bad_json" }, 400, reqId); }

  if (!Array.isArray(body?.leads)) {
    return jsonResponse({ error: "leads_array_required" }, 400, reqId);
  }
  if (body.leads.length === 0) {
    return jsonResponse({ inserted: 0, updated: 0, skipped: 0 }, 200, reqId);
  }
  if (body.leads.length > MAX_BATCH) {
    return jsonResponse({ error: `batch_too_large_max_${MAX_BATCH}` }, 400, reqId);
  }

  const items = body.leads.map(raw => {
    const source = (raw.source || "local").toLowerCase();
    if (!VALID_SOURCES.has(source)) return { error: "bad_source", raw };
    const hash = leadHash({ source, name: raw.name, phone: raw.phone, address: raw.address });
    const record = { ...raw, source, hash, ingested_at: new Date().toISOString() };
    const score = Number(raw._score_ts) || Date.parse(raw.date || "") || Date.now();
    return { source, hash, record, score };
  });

  const bad = items.find(i => i.error);
  if (bad) return jsonResponse({ error: "bad_source_in_batch", source: bad.raw?.source }, 400, reqId);

  const redis = getRedis();
  const existing = await redis.mget(...items.map(i => K.lead(i.source, i.hash)));

  const pipe = redis.pipeline();
  let inserted = 0, updated = 0, skipped = 0;

  for (let i = 0; i < items.length; i++) {
    const { source, hash, record, score } = items[i];
    const prev = existing[i];
    const leadKey = K.lead(source, hash);

    try {
      if (!prev) {
        pipe.set(leadKey, record);
        pipe.setnx(K.status(hash), "new");
        pipe.zadd(K.index(source), { score, member: hash });
        inserted++;
        continue;
      }

      const prevCh = contentHash(stripMeta(prev));
      const currCh = contentHash(stripMeta(record));
      if (prevCh === currCh) {
        skipped++;
        continue;
      }

      // Preserve status + notes by only merging scraper fields onto existing record
      const merged = { ...prev, ...record };
      pipe.set(leadKey, merged);
      pipe.zadd(K.index(source), { score, member: hash });
      updated++;
    } catch (err) {
      log(reqId, `ERROR ${source}:${hash} ${err?.message || err}`);
    }
  }

  pipe.set(K.lastSync(), new Date().toISOString());
  pipe.del(K.weekStats());
  await pipe.exec();

  const source = items[0]?.source || "mixed";
  log(reqId, `batch source=${source} inserted=${inserted} updated=${updated} skipped=${skipped} total=${items.length}`);

  return jsonResponse({ inserted, updated, skipped, total: items.length }, 200, reqId);
}

export default toNodeHandler(webHandler);
