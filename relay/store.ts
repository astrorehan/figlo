import { mkdirSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { parsePush, type Session } from "./protocol";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export class SessionStore {
  private cache = new Map<string, { session: Session; bytes: number }>();
  constructor(readonly dir: string, private options = { ttl: RETENTION_MS, diskBytes: 512 * 1024 * 1024, files: 64, memoryBytes: 64 * 1024 * 1024 }, private now = Date.now) {
    mkdirSync(dir, { recursive: true, mode: 0o700 }); this.sweep();
  }
  private path(code: string) { return join(this.dir, code + ".ffp"); }
  private entries() { return readdirSync(this.dir).filter(f => CODE.test(f.slice(0, -4)) && f.endsWith(".ffp")); }
  sweep() {
    for (const f of this.entries()) if (this.now() - statSync(join(this.dir, f)).mtimeMs >= this.options.ttl) {
      unlinkSync(join(this.dir, f)); this.cache.delete(f.slice(0, -4));
    }
  }
  private remember(code: string, session: Session, bytes: number) {
    this.cache.delete(code);
    let total = [...this.cache.values()].reduce((n, s) => n + s.bytes, 0);
    while (this.cache.size && total + bytes > this.options.memoryBytes) {
      const oldest = this.cache.keys().next().value!; total -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
    }
    if (bytes <= this.options.memoryBytes) this.cache.set(code, { session, bytes });
  }
  put(buf: Uint8Array) {
    const session = parsePush(buf, this.now()); this.sweep();
    const entries = this.entries(), bytes = entries.reduce((n, f) => n + statSync(join(this.dir, f)).size, 0);
    if (entries.length >= this.options.files || bytes + buf.byteLength > this.options.diskBytes) throw new Error("relay storage quota reached; delete exports or wait for expiry");
    for (;;) {
      const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
      try { writeFileSync(this.path(code), buf, { flag: "wx", mode: 0o600 }); }
      catch (e: any) { if (e.code === "EEXIST") continue; throw e; }
      this.remember(code, session, buf.byteLength); return code;
    }
  }
  get(code: string): Session | undefined {
    if (!CODE.test(code)) return;
    let stat;
    try { stat = statSync(this.path(code)); } catch (e: any) { if (e.code === "ENOENT") return; throw e; }
    if (this.now() - stat.mtimeMs >= this.options.ttl) { this.delete(code); return; }
    const hit = this.cache.get(code); if (hit) return hit.session;
    const session = parsePush(new Uint8Array(readFileSync(this.path(code))), stat.mtimeMs);
    this.remember(code, session, stat.size); return session;
  }
  delete(code: string) {
    if (!CODE.test(code)) return false; this.cache.delete(code);
    try { unlinkSync(this.path(code)); return true; } catch (e: any) { if (e.code === "ENOENT") return false; throw e; }
  }
}
