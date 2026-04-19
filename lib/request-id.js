export function newRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

export function log(reqId, ...args) {
  console.log(`[${reqId}]`, ...args);
}

export function jsonResponse(data, status = 200, reqId, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    ...extraHeaders,
  });
  if (reqId) headers.set("X-Request-Id", reqId);
  const body = reqId ? { ...data, request_id: reqId } : data;
  return new Response(JSON.stringify(body), { status, headers });
}
