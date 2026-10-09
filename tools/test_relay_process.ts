// Real sockets and CLI client, isolated from any running user relay or saved designs.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
const directory = mkdtempSync(join(tmpdir(), "figlo-process-test-"));
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
const port = probe.port; probe.stop(true);
const token = randomBytes(32).toString("hex"), url = `http://127.0.0.1:${port}`;
const child = Bun.spawn([process.execPath, "relay/relay.ts"], {
  env: { ...process.env, FIGLO_PORT: String(port), FIGLO_TOKEN: token, FIGLO_SESSIONS: join(directory, "sessions") },
  stdout: "pipe", stderr: "pipe",
});
const logs = new Response(child.stdout).text(), errors = new Response(child.stderr).text();
try {
  let up = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { up = (await fetch(url + "/ping", { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (up) break;
    await Bun.sleep(50);
  }
  if (!up) throw new Error("Relay process did not become ready");
  const ir = await Bun.file("samples/demo.ir.json").json();
  const json = new TextEncoder().encode(JSON.stringify({ ir, images: [] })), body = new Uint8Array(json.length + 8);
  body.set(new TextEncoder().encode("FFP1")); new DataView(body.buffer).setUint32(4, json.length, true); body.set(json, 8);
  const file = join(directory, "export.txt");
  writeFileSync(file, "FFGZ:" + Buffer.from(Bun.gzipSync(body)).toString("base64"));
  const client = Bun.spawn([process.execPath, "tools/push_clipboard.ts", file], {
    env: { ...process.env, FIGLO_RELAY: url, FIGLO_TOKEN: token }, stdout: "pipe", stderr: "pipe",
  });
  const output = await new Response(client.stdout).text();
  const clientError = await new Response(client.stderr).text();
  if (await client.exited !== 0) throw new Error("CLI push failed: " + clientError);
  const code = output.match(/^[A-HJ-NP-Z2-9]{6}/)?.[0]; if (!code) throw new Error("CLI did not return an export code");
  const headers = { Authorization: "Bearer " + token };
  if ((await fetch(`${url}/pull/${code}`)).status !== 401) throw new Error("Unauthenticated network read succeeded");
  if ((await fetch(`${url}/pull/${code}`, { headers: { ...headers, Origin: "https://evil.example" } })).status !== 403) throw new Error("Untrusted origin succeeded");
  const pull = await fetch(`${url}/pull/${code}`, { headers });
  if ((await pull.json()).ir.root.name !== "Figlo Demo") throw new Error("Network round trip changed the IR");
  if (!(await fetch(`${url}/exports/${code}`, { method: "DELETE", headers })).ok) throw new Error("Network delete failed");
  if ((await fetch(`${url}/pull/${code}`, { headers })).status !== 404) throw new Error("Deleted export remains readable");
  console.log("relay process: real HTTP pairing, gzip CLI export, origin rejection, round trip and deletion passed");
} finally {
  child.kill(); await child.exited; await logs; await errors;
  const target = resolve(directory), prefix = resolve(tmpdir()) + sep + "figlo-process-test-";
  if (!target.startsWith(prefix)) throw new Error("Refusing cleanup outside the isolated test directory");
  rmSync(target, { recursive: true, force: true });
}
