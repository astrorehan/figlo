// FrameFig local relay. The Figma plugin pushes one export (IR + raw RGBA images)
// and gets a short code; the Studio plugin pulls it with that code.
// Run: bun relay/relay.ts   (listens on 127.0.0.1 only)

const PORT = Number(process.env.FRAMEFIG_PORT ?? 34880);
const TTL_MS = 60 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

type Img = { key: string; w: number; h: number; nw?: number; nh?: number; sha: string; data: Uint8Array };
type Session = { ir: string; images: Img[]; at: number };

const sessions = new Map<string, Session>();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Private-Network": "true",
};

function reply(body: BodyInit | null, status = 200, type = "application/json") {
  return new Response(body, { status, headers: { ...CORS, "Content-Type": type } });
}

function newCode(): string {
  for (;;) {
    let c = "";
    for (const b of crypto.getRandomValues(new Uint8Array(6))) c += ALPHABET[b % ALPHABET.length];
    if (!sessions.has(c)) return c;
  }
}

function sweep() {
  const now = Date.now();
  for (const [c, s] of sessions) if (now - s.at > TTL_MS) sessions.delete(c);
}

// Push format: "FFP1", u32 LE json length, json {ir, images:[{key,w,h,nw?,nh?}]}, then
// each image's w*h*4 RGBA bytes back to back in the same order.
function parsePush(buf: Uint8Array): Session {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== "FFP1") throw new Error("bad magic");
  const jsonLen = view.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + jsonLen)));
  let off = 8 + jsonLen;
  const images: Img[] = [];
  for (const im of head.images) {
    const len = im.w * im.h * 4;
    if (off + len > buf.byteLength) throw new Error(`image ${im.key} truncated`);
    const data = buf.slice(off, off + len);
    off += len;
    const sha = new Bun.CryptoHasher("sha1").update(data).digest("hex");
    images.push({ key: im.key, w: im.w, h: im.h, nw: im.nw, nh: im.nh, sha, data });
  }
  return { ir: typeof head.ir === "string" ? head.ir : JSON.stringify(head.ir), images, at: Date.now() };
}

async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "OPTIONS") return reply(null, 204);
    try {
      if (parts[0] === "ping") return reply(JSON.stringify({ ok: true, app: "framefig-relay", v: 1 }));

      // Studio module sources, so a dev copy in Studio can be synced without the plugin.
      if (parts[0] === "src" && req.method === "GET") {
        const rel = parts.slice(1).join("/");
        if (!/^[\w/.]+\.luau$/.test(rel) || rel.includes("..")) return reply(JSON.stringify({ error: "bad path" }), 400);
        const f = Bun.file(new URL(`../studio/src/${rel}`, import.meta.url));
        if (!(await f.exists())) return reply(JSON.stringify({ error: "not found" }), 404);
        return reply(await f.text(), 200, "text/plain");
      }

      if (req.method === "POST" && parts[0] === "push") {
        sweep();
        const s = parsePush(new Uint8Array(await req.arrayBuffer()));
        const code = newCode();
        sessions.set(code, s);
        const mb = s.images.reduce((n, i) => n + i.data.byteLength, 0) / 1e6;
        console.log(`push ${code}: ${s.images.length} images, ${mb.toFixed(1)} MB`);
        return reply(JSON.stringify({ code }));
      }

      // Same push as a top-level form navigation (multipart field "ffp"). Browsers that
      // block fetch() from a public page to loopback still allow this.
      if (req.method === "POST" && parts[0] === "push-form") {
        sweep();
        const file = (await req.formData()).get("ffp");
        if (!(file instanceof Blob)) return reply("missing ffp field", 400, "text/plain");
        const s = parsePush(new Uint8Array(await file.arrayBuffer()));
        const code = newCode();
        sessions.set(code, s);
        const mb = s.images.reduce((n, i) => n + i.data.byteLength, 0) / 1e6;
        console.log(`push ${code}: ${s.images.length} images, ${mb.toFixed(1)} MB (form)`);
        return reply(`<!doctype html><title>FrameFig ${code}</title><h1 id="code">${code}</h1>`, 200, "text/html");
      }

      const s = parts[1] && sessions.get(parts[1].toUpperCase());
      if (parts[0] === "pull" && req.method === "GET") {
        if (!s) return reply(JSON.stringify({ error: "unknown or expired code" }), 404);
        const images = s.images.map((im, i) => ({ i, key: im.key, w: im.w, h: im.h, nw: im.nw, nh: im.nh, sha: im.sha }));
        return reply(`{"ir":${s.ir},"images":${JSON.stringify(images)}}`);
      }

      if (parts[0] === "img" && req.method === "GET") {
        const im = s && s.images[Number(parts[2])];
        if (!im) return reply(JSON.stringify({ error: "not found" }), 404);
        return reply(im.data, 200, "application/octet-stream");
      }

      return reply(JSON.stringify({ error: "not found" }), 404);
    } catch (e) {
      console.error(e);
      return reply(JSON.stringify({ error: String((e as Error).message ?? e) }), 400);
    }
}

// Loopback only, on both stacks: "localhost" may resolve to ::1 (Figma) or 127.0.0.1 (Studio).
for (const hostname of ["127.0.0.1", "::1"]) {
  try {
    Bun.serve({ hostname, port: PORT, maxRequestBodySize: 512 * 1024 * 1024, fetch: handle });
  } catch (e) {
    if (hostname === "127.0.0.1") throw e;
    console.warn(`IPv6 loopback unavailable: ${(e as Error).message}`);
  }
}

console.log(`FrameFig relay on http://localhost:${PORT}`);
