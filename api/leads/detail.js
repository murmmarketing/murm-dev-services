import { getRedis } from "../../lib/redis.js";
import { requireSession } from "../../lib/auth.js";
import { newRequestId, jsonResponse } from "../../lib/request-id.js";
import { K } from "../../lib/leads.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

async function webHandler(request) {
  const reqId = newRequestId();
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "unauthorized" }, 401, reqId);
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, reqId);

  const url = new URL(request.url);
  const hash = url.searchParams.get("hash");
  if (!hash) return jsonResponse({ error: "hash_required" }, 400, reqId);

  const redis = getRedis();
  const [notes, status] = await Promise.all([
    redis.lrange(K.notes(hash), 0, -1),
    redis.get(K.status(hash)),
  ]);

  return jsonResponse({ hash, status: status || "new", notes: notes || [] }, 200, reqId);
}

export default toNodeHandler(webHandler);
