import { Buffer } from "node:buffer";

// Wraps a Web-standard handler (Request -> Response) into Vercel's
// Node-runtime (req, res) signature, which is what @vercel/node passes in.
export function toNodeHandler(webHandler) {
  return async function (req, res) {
    try {
      const proto = req.headers["x-forwarded-proto"]
        || (req.socket?.encrypted ? "https" : "http");
      const host = req.headers.host || "localhost";
      const url = `${proto}://${host}${req.url || "/"}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach(x => headers.append(k, x));
        else if (v !== undefined) headers.set(k, String(v));
      }

      let body;
      if (req.method !== "GET" && req.method !== "HEAD") {
        // Prefer Vercel's pre-parsed req.body (for JSON/text bodies) — avoids
        // a known hang where middleware + PATCH doesn't re-emit 'end' on the
        // raw stream in `vercel dev`.
        if (req.body !== undefined && req.body !== null) {
          if (Buffer.isBuffer(req.body) || typeof req.body === "string") {
            body = req.body;
          } else {
            body = JSON.stringify(req.body);
            if (!headers.has("content-type")) headers.set("content-type", "application/json");
          }
        } else if (req.readableEnded) {
          body = undefined;
        } else {
          body = await new Promise((resolve, reject) => {
            const chunks = [];
            req.on("data", c => chunks.push(c));
            req.on("end", () => resolve(Buffer.concat(chunks)));
            req.on("error", reject);
          });
        }
      }

      const webReq = new Request(url, { method: req.method, headers, body });
      const webRes = await webHandler(webReq);

      res.statusCode = webRes.status;
      const setCookies = [];
      webRes.headers.forEach((v, k) => {
        if (k.toLowerCase() === "set-cookie") setCookies.push(v);
        else res.setHeader(k, v);
      });
      if (setCookies.length) res.setHeader("Set-Cookie", setCookies);

      const buf = Buffer.from(await webRes.arrayBuffer());
      res.end(buf);
    } catch (err) {
      console.error("[node-adapter]", err?.stack || err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "server_error", message: String(err?.message || err) }));
    }
  };
}
