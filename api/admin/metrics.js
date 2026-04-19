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
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405, reqId);
  }

  const redis = getRedis();
  const cached = await redis.get(K.weekStats());
  if (cached) {
    return jsonResponse({ stats: cached, cached: true }, 200, reqId);
  }

  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const twoWeeksAgo = now - 14 * 86_400_000;

  const [local, shopify, demos, prevLocal, prevShopify, prevDemos, lastSync] = await Promise.all([
    redis.zcount(K.index("local"), weekAgo, now).catch(() => 0),
    redis.zcount(K.index("shopify"), weekAgo, now).catch(() => 0),
    redis.zcount(K.index("demos"), weekAgo, now).catch(() => 0),
    redis.zcount(K.index("local"), twoWeeksAgo, weekAgo).catch(() => 0),
    redis.zcount(K.index("shopify"), twoWeeksAgo, weekAgo).catch(() => 0),
    redis.zcount(K.index("demos"), twoWeeksAgo, weekAgo).catch(() => 0),
    redis.get(K.lastSync()),
  ]);

  const stats = {
    new_this_week: { current: (local || 0) + (shopify || 0), previous: (prevLocal || 0) + (prevShopify || 0) },
    outreach_sent_this_week: { current: 0, previous: 0 },
    replies_this_week: { current: 0, previous: 0 },
    demos_this_week: { current: demos || 0, previous: prevDemos || 0 },
    last_sync: lastSync || null,
    generated_at: new Date().toISOString(),
  };

  await redis.set(K.weekStats(), stats, { ex: 3600 });
  return jsonResponse({ stats, cached: false }, 200, reqId);
}

export default toNodeHandler(webHandler);
