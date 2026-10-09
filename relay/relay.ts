// Local paired relay. Never bind this service to a public interface.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionStore } from "./store";
import { LIMITS } from "./protocol";

export function createHandler(store: SessionStore, token: string, port: number) {
  const allowedOrigins = new Set(["null", "https://www.figma.com", "https://figma.com"]);
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url), origin = req.headers.get("Origin");
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
    const reply = (value: any, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || Number(url.port || (url.protocol === "https:" ? 443 : 80)) !== port) return reply({ error: "invalid relay host" }, 403);
    if (origin !== null && !allowedOrigins.has(origin)) return reply({ error: "origin not allowed" }, 403);
    if (origin !== null) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
      headers["Access-Control-Allow-Private-Network"] = "true";
    }
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/ping" && req.method === "GET") return reply({ ok: true, app: "figlo-relay", v: 1 });
    const actual = Buffer.from(req.headers.get("Authorization") ?? ""), expected = Buffer.from("Bearer " + token);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply({ error: "relay token missing or incorrect" }, 401);
    try {
      if (url.pathname === "/push" && req.method === "POST") {
        if (Number(req.headers.get("Content-Length")) > LIMITS.request) return reply({ error: "export exceeds 64 MiB" }, 413);
        const reader = req.body?.getReader(), chunks: Uint8Array[] = [];
        let bytes = 0;
        if (reader) for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > LIMITS.request) { await reader.cancel(); return reply({ error: "export exceeds 64 MiB" }, 413); }
          chunks.push(value);
        }
        const body = new Uint8Array(bytes); let off = 0;
        for (const chunk of chunks) { body.set(chunk, off); off += chunk.byteLength; }
        return reply({ code: store.put(body) });
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "src" && req.method === "GET") {
        const rel = parts.slice(1).join("/");
        if (!/^(?:\w+\/)*\w+(?:\.(?:client|server))?\.luau$/.test(rel)) return reply({ error: "invalid source path" }, 400);
        const f = Bun.file(new URL("../studio/src/" + rel, import.meta.url));
        if (!(await f.exists())) return reply({ error: "not found" }, 404);
        return new Response(await f.text(), { headers: { ...headers, "Content-Type": "text/plain" } });
      }
      const code = parts[1]?.toUpperCase();
      if (parts[0] === "exports" && parts.length === 2 && req.method === "DELETE") return reply({ deleted: store.delete(code ?? "") });
      if ((parts[0] === "pull" && parts.length === 2 || parts[0] === "img" && parts.length === 3) && req.method === "GET") {
        const session = code && store.get(code);
        if (!session) return reply({ error: "unknown or expired code" }, 404);
        if (parts[0] === "pull") return reply({ ir: session.ir, images: session.images.map(({ data, ...im }, i) => ({ ...im, i })) });
        if (!/^(0|[1-9]\d*)$/.test(parts[2])) return reply({ error: "invalid image index" }, 400);
        const image = session.images[Number(parts[2])];
        if (!image) return reply({ error: "image not found" }, 404);
        return new Response(image.data, { headers: { ...headers, "Content-Type": "application/octet-stream" } });
      }
      return reply({ error: "not found" }, 404);
    } catch (e) {
      const message = e instanceof Error ? e.message : "request failed";
      return reply({ error: /quota reached/.test(message) ? message : "invalid export or request" }, /quota reached/.test(message) ? 507 : 400);
    }
  };
}
if (import.meta.main) {
  const port = Number(process.env.FIGLO_PORT ?? 34880);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("FIGLO_PORT must be in 1024..65535");
  const token = process.env.FIGLO_TOKEN ?? randomBytes(32).toString("hex");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error("FIGLO_TOKEN must contain 32..128 letters, digits, underscores or hyphens");
  const dir = process.env.FIGLO_SESSIONS ? resolve(process.env.FIGLO_SESSIONS) : fileURLToPath(new URL("./.sessions/", import.meta.url));
  const store = new SessionStore(dir), servers = [];
  for (const hostname of ["127.0.0.1", "::1"]) {
    try { servers.push(Bun.serve({ hostname, port, maxRequestBodySize: LIMITS.request, fetch: createHandler(store, token, port) })); }
    catch (e) { if (hostname === "127.0.0.1") throw e; console.warn("IPv6 loopback unavailable; use 127.0.0.1"); }
  }
  const timer = setInterval(() => { try { store.sweep(); } catch { console.warn("Export cleanup failed; check session directory permissions"); } }, 60000);
  console.log(`Figlo relay: http://localhost:${port}\nPairing token (keep private): ${token}\nExports stay on this computer for up to 7 days.`);
  const stop = () => { clearInterval(timer); for (const server of servers) server.stop(true); process.exit(0); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
