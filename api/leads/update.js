import { getRedis } from "../../lib/redis.js";
import { requireSession } from "../../lib/auth.js";
import { newRequestId, log, jsonResponse } from "../../lib/request-id.js";
import { K, VALID_STATUS } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

async function webHandler(request) {
  const reqId = newRequestId();
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "unauthorized" }, 401, reqId);
  if (request.method !== "PATCH") return jsonResponse({ error: "method_not_allowed" }, 405, reqId);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "bad_json" }, 400, reqId); }

  const { hash, status, note } = body || {};
  if (!hash || typeof hash !== "string") {
    return jsonResponse({ error: "hash_required" }, 400, reqId);
  }

  const redis = getRedis();
  const pipe = redis.pipeline();
  const changed = {};

  if (status !== undefined) {
    if (!VALID_STATUS.has(status)) return jsonResponse({ error: "invalid_status" }, 400, reqId);
    pipe.set(K.status(hash), status);
    changed.status = status;
  }

  if (note !== undefined) {
    if (typeof note !== "string" || !note.trim()) {
      return jsonResponse({ error: "note_must_be_nonempty_string" }, 400, reqId);
    }
    const entry = { ts: new Date().toISOString(), text: note.trim().slice(0, 2000) };
    pipe.rpush(K.notes(hash), entry);
    changed.note_added = true;
  }

  if (Object.keys(changed).length === 0) {
    return jsonResponse({ error: "nothing_to_update" }, 400, reqId);
  }

  pipe.del(K.weekStats());
  await pipe.exec();
  log(reqId, `update ${hash} ${JSON.stringify(changed)}`);
  return jsonResponse({ ok: true, hash, changed }, 200, reqId);
}

export default toNodeHandler(webHandler);
