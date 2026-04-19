import { clearSessionCookie, requireSession } from "../../lib/auth.js";
import { newRequestId, jsonResponse } from "../../lib/request-id.js";
import { toNodeHandler } from "../../lib/node-adapter.js";

export const config = { runtime: "nodejs" };

async function webHandler(request) {
  const reqId = newRequestId();
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, reqId);
  }
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "unauthorized" }, 401, reqId);
  return jsonResponse({ ok: true }, 200, reqId, { "Set-Cookie": clearSessionCookie() });
}

export default toNodeHandler(webHandler);
