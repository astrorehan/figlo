import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = await Bun.file(join(root, "package.json")).json();
for (const task of ["check", "build"]) {
  const child = Bun.spawn(["bun", "run", task], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error(task + " failed");
}
const child = Bun.spawn(["python", "tools/package_zip.py", version], { cwd: root, stdout: "inherit", stderr: "inherit" });
if (await child.exited !== 0) throw new Error("Packaging requires Python 3.10+ and a fully tracked source tree");
const dir = join(root, "build", "release", version);
const names = readdirSync(dir).filter(n => /\.(zip|rbxm|js)$/.test(n) || n === "LICENSE.txt").sort();
const sums = names.map(name => `${createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")}  ${name}`).join("\n") + "\n";
writeFileSync(join(dir, "SHA256SUMS.txt"), sums);
console.log("Release artifacts: " + dir);
