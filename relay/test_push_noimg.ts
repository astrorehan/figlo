// Pushes samples/flash.ir.json with no images (dry run of the Studio importer). Dev only.
const ir = await Bun.file(new URL("../samples/flash.ir.json", import.meta.url)).text();
const head = new TextEncoder().encode(JSON.stringify({ ir: JSON.parse(ir), images: [] }));
const buf = new Uint8Array(8 + head.length);
buf.set(new TextEncoder().encode("FFP1"));
new DataView(buf.buffer).setUint32(4, head.length, true);
buf.set(head, 8);
console.log(await (await fetch("http://127.0.0.1:34880/push", { method: "POST", body: buf })).text());
