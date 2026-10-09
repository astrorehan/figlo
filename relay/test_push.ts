// Pushes samples/demo.ir.json plus synthetic images, prints the code. Dev only.
const ir = await Bun.file(new URL("../samples/demo.ir.json", import.meta.url)).text();
const w = Number(process.argv[2] ?? 256), h = Number(process.argv[3] ?? 128);
const px = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  px[i] = x; px[i + 1] = y * 2; px[i + 2] = 255 - x; px[i + 3] = (x + y) % 256; // every byte value 0..255
}
const head = new TextEncoder().encode(JSON.stringify({ ir: JSON.parse(ir), images: [{ key: "test", w, h }] }));
const buf = new Uint8Array(8 + head.length + px.length);
buf.set(new TextEncoder().encode("FFP1"));
new DataView(buf.buffer).setUint32(4, head.length, true);
buf.set(head, 8);
buf.set(px, 8 + head.length);
const token = process.env.FIGLO_TOKEN;
if (!token) throw new Error("Set FIGLO_TOKEN to the relay pairing token");
const r = await fetch("http://127.0.0.1:34880/push", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: buf });
console.log(await r.text());
