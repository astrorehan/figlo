// Builds the paste-into-console driver for figma.com: extract.js + figma/page_driver.js,
// minified into one IIFE at out/figlo-page.min.js. Paste its contents into the Figma tab
// with javascript_tool; it installs window.__ffrun(id), window.__ffcopy() and window.__ffextract.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const extract = readFileSync(join(root, "figma/extract.js"), "utf8")
	.split(/\r?\n/)
	.filter((l) => !l.startsWith("if (typeof module"))
	.join("\n");
const driver = readFileSync(join(root, "figma/page_driver.js"), "utf8");
mkdirSync(join(root, "out"), { recursive: true });
const src = join(root, "out/figlo-page-src.js");
writeFileSync(src, extract + "\n" + driver);
const res = await Bun.build({ entrypoints: [src], minify: true, format: "iife" });
if (!res.success) throw new AggregateError(res.logs, "build failed");
const code = await res.outputs[0].text();
writeFileSync(join(root, "out/figlo-page.min.js"), code);
console.log(`out/figlo-page.min.js (${code.length} bytes)`);
