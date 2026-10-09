import { demoFrame } from "../figma/fixtures";
const { extract } = require("../figma/extract.js");
(globalThis as any).figma = { fileKey: "figlo-demo" };
const ir = extract(demoFrame());
await Bun.write(new URL("../samples/demo.ir.json", import.meta.url), JSON.stringify(ir, null, 2) + "\n");
console.log("samples/demo.ir.json generated from the original demo fixture");
