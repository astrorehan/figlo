// FFP1: length-prefixed JSON header followed by straight RGBA pixels.
export const LIMITS = { request: 64 * 1024 * 1024, header: 4 * 1024 * 1024, images: 256, side: 1024, nodes: 10000, depth: 64 };
export type Img = { key: string; w: number; h: number; nw?: number; nh?: number; sha: string; data: Uint8Array };
export type Session = { ir: any; images: Img[]; at: number };
const object = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const positive = (v: any) => typeof v === "number" && Number.isFinite(v) && v > 0;
const name = (v: any) => typeof v === "string" && v.length > 0 && v.length <= 1024;
const kinds = new Set(["frame", "image", "text", "clip", "canvas"]);
export function validateIR(ir: any) {
  if (!object(ir) || ir.v !== 1) throw new Error("unsupported IR version (expected 1)");
  if (!object(ir.design) || !positive(ir.design.w) || !positive(ir.design.h)) throw new Error("invalid design dimensions");
  if (!object(ir.source) || !name(ir.source.node) || !name(ir.source.name) || !(ir.source.file === null || name(ir.source.file))) throw new Error("invalid source");
  if (ir.screen !== undefined && (!object(ir.screen) || !positive(ir.screen.w) || !positive(ir.screen.h))) throw new Error("invalid reference screen");
  if (!Array.isArray(ir.warnings) || ir.warnings.some((v: any) => typeof v !== "string")) throw new Error("invalid warnings");
  let count = 0;
  const imageKeys = new Set<string>();
  function walk(n: any, depth: number) {
    if (++count > LIMITS.nodes || depth > LIMITS.depth) throw new Error("IR tree too large or deep");
    if (!object(n) || !kinds.has(n.kind) || !name(n.name) || !name(n.id)) throw new Error("invalid IR node");
    for (const k of ["x", "y", "w", "h", "rot", "pw", "ph"]) if (typeof n[k] !== "number" || !Number.isFinite(n[k])) throw new Error("invalid node geometry");
    if (n.w < 0 || n.h < 0 || n.pw < 0 || n.ph < 0) throw new Error("negative node dimensions");
    if (n.kind === "image") { if (!name(n.image)) throw new Error("invalid image reference"); imageKeys.add(n.image); }
    if (n.kind === "text" && (!object(n.text) || typeof n.text.value !== "string" || !name(n.text.family) || !positive(n.text.size))) throw new Error("invalid text node");
    if (n.children !== undefined) { if (!Array.isArray(n.children)) throw new Error("invalid children"); for (const child of n.children) walk(child, depth + 1); }
  }
  walk(ir.root, 0);
  if (ir.root.kind !== "frame") throw new Error("root must be a frame");
  return imageKeys;
}
export function parsePush(buf: Uint8Array, now = Date.now()): Session {
  if (buf.byteLength > LIMITS.request) throw new Error("export exceeds 64 MiB");
  if (buf.byteLength < 8 || new TextDecoder().decode(buf.subarray(0, 4)) !== "FFP1") throw new Error("bad FFP1 header");
  const jsonLen = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(4, true);
  if (jsonLen === 0 || jsonLen > LIMITS.header || jsonLen > buf.byteLength - 8) throw new Error("invalid header length");
  const head = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(8, 8 + jsonLen)));
  if (!object(head) || !Array.isArray(head.images) || head.images.length > LIMITS.images) throw new Error("invalid image list");
  const ir = typeof head.ir === "string" ? JSON.parse(head.ir) : head.ir;
  const wanted = validateIR(ir);
  let off = 8 + jsonLen;
  const images: Img[] = [], keys = new Set<string>();
  for (const im of head.images) {
    if (!object(im) || !name(im.key) || keys.has(im.key)) throw new Error("invalid or duplicate image key");
    keys.add(im.key);
    for (const k of ["w", "h"]) if (!Number.isInteger(im[k]) || im[k] < 1 || im[k] > LIMITS.side) throw new Error("image dimensions must be integers in 1..1024");
    if ((im.nw === undefined) !== (im.nh === undefined) || (im.nw !== undefined && (!positive(im.nw) || !positive(im.nh)))) throw new Error("invalid native dimensions");
    const len = im.w * im.h * 4;
    if (off + len > buf.byteLength) throw new Error("truncated image data");
    const data = buf.slice(off, off + len); off += len;
    const sha = new Bun.CryptoHasher("sha1").update(data).digest("hex");
    images.push({ key: im.key, w: im.w, h: im.h, nw: im.nw, nh: im.nh, sha, data });
  }
  if (off !== buf.byteLength) throw new Error("unexpected trailing data");
  // No images is an intentional dry run; partially supplied images are errors.
  if (images.length && [...wanted].some(key => !keys.has(key))) throw new Error("missing image data");
  return { ir, images, at: now };
}
