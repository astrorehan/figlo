import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { parsePush, validateIR, LIMITS } from "./protocol";
import { SessionStore } from "./store";
import { createHandler } from "./relay";
import { demoFrame } from "../figma/fixtures";
const { extract } = require("../figma/extract.js");
(globalThis as any).figma = { fileKey: "figlo-demo" };
const ir = () => extract(demoFrame());
function pack(head: any, pixels = new Uint8Array()) {
  const json = new TextEncoder().encode(JSON.stringify(head)), buf = new Uint8Array(8 + json.length + pixels.length);
  buf.set(new TextEncoder().encode("FFP1")); new DataView(buf.buffer).setUint32(4, json.length, true);
  buf.set(json, 8); buf.set(pixels, 8 + json.length); return buf;
}
const dirs: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), "figlo-test-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) {
  if (!resolve(d).startsWith(resolve(tmpdir()) + sep + "figlo-test-")) throw new Error("Unsafe test cleanup path");
  rmSync(d, { recursive: true, force: true });
} });

describe("FFP1 validation", () => {
  test("accepts original demo and string IR", () => {
    expect(parsePush(pack({ ir: ir(), images: [] })).ir.root.name).toBe("Figlo Demo");
    expect(parsePush(pack({ ir: JSON.stringify(ir()), images: [] })).ir.v).toBe(1);
  });
  test("accepts image bytes and hashes the exact pixel data", () => {
    const pixels = new Uint8Array([255, 0, 127, 128]);
    const out = parsePush(pack({ ir: ir(), images: [{ key: "pixel", w: 1, h: 1 }] }, pixels));
    expect(out.images[0].data).toEqual(pixels); expect(out.images[0].sha).toHaveLength(40);
  });
  test("rejects short, wrong and truncated headers", () => {
    for (const b of [new Uint8Array(), new Uint8Array(8), new TextEncoder().encode("FFP1xxxx")]) expect(() => parsePush(b)).toThrow();
    const b = pack({ ir: ir(), images: [] }); new DataView(b.buffer).setUint32(4, b.length, true);
    expect(() => parsePush(b)).toThrow("header length");
  });
  test("rejects invalid schema, geometry, tree depth and child list", () => {
    for (const bad of [null, {}, { ...ir(), v: 2 }, { ...ir(), design: { w: -1, h: 1 } }, { ...ir(), root: { ...ir().root, children: {} } }]) expect(() => validateIR(bad)).toThrow();
    const deep = ir(); let n = deep.root;
    for (let i = 0; i < 65; i++) { n.children = [{ ...ir().root, children: [] }]; n = n.children[0]; }
    expect(() => validateIR(deep)).toThrow("deep");
  });
  test("rejects invalid image dimensions, duplicate keys, missing bytes and trailers", () => {
    for (const size of [0, -1, 1.5, 1025, "1", null]) expect(() => parsePush(pack({ ir: ir(), images: [{ key: "a", w: size, h: 1 }] }))).toThrow();
    expect(() => parsePush(pack({ ir: ir(), images: [{ key: "a", w: 1, h: 1 }] }))).toThrow("truncated");
    expect(() => parsePush(pack({ ir: ir(), images: [{ key: "a", w: 1, h: 1 }, { key: "a", w: 1, h: 1 }] }, new Uint8Array(8)))).toThrow("duplicate");
    expect(() => parsePush(pack({ ir: ir(), images: [] }, new Uint8Array(4)))).toThrow("trailing");
    expect(() => parsePush(pack({ ir: ir(), images: [{ key: "a", w: 1, h: 1, nw: 1 }] }, new Uint8Array(4)))).toThrow("native");
  });
});
describe("export retention and quotas", () => {
  const options = { ttl: 60000, diskBytes: 100000, files: 2, memoryBytes: 0 };
  test("survives restart, deletes explicitly, and bounds disk count", () => {
    const d = dir(), s = new SessionStore(d, options), data = pack({ ir: ir(), images: [] });
    const a = s.put(data), b = s.put(data);
    expect(a).not.toBe(b); expect(new SessionStore(d, options).get(a)?.ir.v).toBe(1);
    expect(() => s.put(data)).toThrow("quota"); expect(s.delete(a)).toBe(true); expect(s.get(a)).toBeUndefined();
    expect(s.put(data)).toHaveLength(6); expect(s.delete("../../x")).toBe(false);
  });
  test("expiry is enforced on cached reads and after restart", () => {
    const d = dir(); let now = Date.now();
    const opts = { ...options, ttl: 1000, memoryBytes: 100000 }, s = new SessionStore(d, opts, () => now);
    const code = s.put(pack({ ir: ir(), images: [] })); now += 2000;
    expect(s.get(code)).toBeUndefined(); expect(readdirSync(d)).toHaveLength(0);
    const code2 = s.put(pack({ ir: ir(), images: [] }));
    utimesSync(join(d, code2 + ".ffp"), new Date(now - 10000), new Date(now - 10000));
    expect(new SessionStore(d, opts, () => now).get(code2)).toBeUndefined();
  });
  test("periodic sweep preserves unrelated files and rejects byte quota", () => {
    const d = dir(), s = new SessionStore(d, { ...options, diskBytes: 1 });
    writeFileSync(join(d, "notes.txt"), "keep"); s.sweep(); expect(readdirSync(d)).toEqual(["notes.txt"]);
    expect(() => s.put(pack({ ir: ir(), images: [] }))).toThrow("quota");
  });
});
describe("HTTP pairing and boundaries", () => {
  const token = "test-pairing-token-0123456789abcdef";
  const request = (path: string, init: RequestInit = {}) => new Request("http://127.0.0.1:34880" + path, init);
  const auth = { Authorization: "Bearer " + token };
  const handler = () => createHandler(new SessionStore(dir()), token, 34880);
  test("ping is public, exports and source require a token", async () => {
    const h = handler(); expect((await h(request("/ping"))).status).toBe(200);
    for (const path of ["/push", "/pull/ABCDEF", "/img/ABCDEF/0", "/src/Builder.luau", "/exports/ABCDEF"])
      expect((await h(request(path))).status).toBe(401);
    expect((await h(request("/pull/ABCDEF", { headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
  });
  test("blocks untrusted origins and rebound hosts; supports opaque plugin origins", async () => {
    const h = handler();
    expect((await h(request("/ping", { headers: { Origin: "https://evil.example" } }))).status).toBe(403);
    expect((await h(new Request("http://evil.example:34880/ping"))).status).toBe(403);
    expect((await h(request("/ping", { headers: { Origin: "https://www.figma.com.evil.example" } }))).status).toBe(403);
    const pre = await h(request("/push", { method: "OPTIONS", headers: { Origin: "null" } }));
    expect(pre.status).toBe(204); expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("null");
    expect((await h(request("/src/Builder.luau", { headers: { ...auth, Origin: "null" } }))).status).toBe(200);
    expect((await h(request("/src/Client.client.luau", { headers: auth }))).status).toBe(200);
    expect((await h(request("/src/Runtime/Effects.luau", { headers: auth }))).status).toBe(200);
    expect((await h(request("/src/.hidden.luau", { headers: auth }))).status).toBe(400);
  });
  test("round trips IR and binary pixels then deletes the export", async () => {
    const h = handler(), pixels = new Uint8Array([0, 255, 128, 0]);
    const push = await h(request("/push", { method: "POST", headers: auth, body: pack({ ir: ir(), images: [{ key: "pixel", w: 1, h: 1 }] }, pixels) }));
    const { code } = await push.json(); expect(push.status).toBe(200);
    const pull = await h(request("/pull/" + code, { headers: auth })), json = await pull.json();
    expect(json.ir.root.name).toBe("Figlo Demo"); expect(json.images[0].i).toBe(0); expect(json.images[0].data).toBeUndefined();
    const image = await h(request(`/img/${code}/0`, { headers: auth })); expect(new Uint8Array(await image.arrayBuffer())).toEqual(pixels);
    expect((await h(request(`/img/${code}/1.5`, { headers: auth }))).status).toBe(400);
    expect((await h(request(`/img/${code}/9`, { headers: auth }))).status).toBe(404);
    expect((await h(request(`/exports/${code}`, { method: "DELETE", headers: auth }))).status).toBe(200);
    expect((await h(request(`/pull/${code}`, { headers: auth }))).status).toBe(404);
  });
  test("rejects oversized and malformed pushes before persisting", async () => {
    const h = handler();
    expect((await h(request("/push", { method: "POST", headers: { ...auth, "Content-Length": String(LIMITS.request + 1) }, body: "x" }))).status).toBe(413);
    expect((await h(request("/push", { method: "POST", headers: auth, body: "bad" }))).status).toBe(400);
  });
  test("bounds chunked requests without trusting Content-Length", async () => {
    const h = handler(), block = new Uint8Array(1024 * 1024);
    let chunks = 0, canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { if (chunks++ < 65) controller.enqueue(block); else controller.close(); },
      cancel() { canceled = true; },
    });
    const response = await h(request("/push", { method: "POST", headers: auth, body: stream, duplex: "half" } as RequestInit));
    expect(response.status).toBe(413); expect(canceled).toBe(true);
  });
});
