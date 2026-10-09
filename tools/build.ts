import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
mkdirSync(new URL("../build/", import.meta.url), { recursive: true });
for (const cmd of [["bun", "tools/build_figma.ts"], ["bun", "tools/build_page.ts"], ["rojo", "build", "plugin.project.json", "-o", "build/Figlo.rbxm"], ["lune", "run", "tools/test_package"]]) {
  const child = Bun.spawn(cmd, { cwd: fileURLToPath(new URL("../", import.meta.url)), stdout: "inherit", stderr: "inherit" });
  if (await child.exited !== 0) throw new Error("Build failed: " + cmd.join(" "));
}
