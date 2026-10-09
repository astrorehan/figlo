// Pushes an export copied from the Figma web page ("FFGZ:" + base64 of the gzipped FFP1
// payload) to the local relay and prints the short code.
// Run: bun tools/push_clipboard.ts [file with the clipboard text]
// Without a file it reads the system clipboard (Windows, macOS, or Linux with xclip).

const RELAY = process.env.FIGLO_RELAY ?? "http://127.0.0.1:34880";
const relayURL = new URL(RELAY);
if (relayURL.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(relayURL.hostname)
  || relayURL.pathname !== "/" || relayURL.search || relayURL.hash || relayURL.username || relayURL.password) throw new Error("FIGLO_RELAY must be an HTTP loopback origin");
const TOKEN = process.env.FIGLO_TOKEN;
if (!TOKEN) throw new Error("Set FIGLO_TOKEN to the pairing token printed by the relay");

async function clipboard(): Promise<string> {
  const cmd =
    process.platform === "win32"
      ? ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"]
      : process.platform === "darwin"
        ? ["pbpaste"]
        : ["xclip", "-selection", "clipboard", "-o"];
  const p = Bun.spawn(cmd, { stdout: "pipe" });
  return await new Response(p.stdout).text();
}

const text = (process.argv[2] ? await Bun.file(process.argv[2]).text() : await clipboard()).trim();
if (!text.startsWith("FFGZ:")) throw new Error("clipboard does not hold a Figlo export");
const payload = Bun.gunzipSync(Buffer.from(text.slice(5), "base64"));
const res = await fetch(`${RELAY}/push`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: payload });
const out = (await res.json()) as { code?: string; error?: string };
if (!res.ok || !out.code) throw new Error(out.error ?? res.statusText);
console.log(`${out.code} (${(payload.byteLength / 1e6).toFixed(1)} MB)`);
