
// --- page driver: extract + export + decode + FFP1 + gzip/base64 (same as plugin main.js + ui.html) ---
const FF_MAX = 1024;
async function ffToRGBA(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const s = Math.min(1, FF_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}
async function ffExportBytes(info) {
  if (info.kind === 'hash') return imageFillBytes(info.hash);
  const node = figma.getNodeById(info.node);
  const scale = Math.min(info.scale || 1, FF_MAX / Math.max(info.w, info.h, 1));
  const opts = { format: 'PNG', constraint: { type: 'SCALE', value: scale } };
  if (info.kind === 'shadow' && 'children' in node && node.children.length) {
    const c = childlessClone(node);
    try { return { bytes: await withoutFoldAsync(c, () => c.exportAsync(opts)) }; } finally { c.remove(); }
  }
  return { bytes: await withoutFoldAsync(node, () => node.exportAsync(opts)) };
}
async function ffRun(rootId) {
  const st = window.__ffstatus = { step: 'extract', done: false, error: null };
  try {
    const t0 = Date.now();
    const ir = extract(figma.getNodeById(rootId));
    window.__ffir = ir;
    const keys = Object.keys(ir.images);
    const decoded = [];
    for (let i = 0; i < keys.length; i++) {
      st.step = `image ${i + 1}/${keys.length} ${keys[i]}`;
      const out = await ffExportBytes(ir.images[keys[i]]);
      const px = await ffToRGBA(out.bytes);
      decoded.push({ key: keys[i], w: px.w, h: px.h, nw: out.nw, nh: out.nh, data: px.data });
    }
    st.step = 'pack';
    const head = new TextEncoder().encode(JSON.stringify({ ir, images: decoded.map(d => ({ key: d.key, w: d.w, h: d.h, nw: d.nw, nh: d.nh })) }));
    const total = 8 + head.length + decoded.reduce((n, d) => n + d.data.length, 0);
    const buf = new Uint8Array(total);
    buf.set(new TextEncoder().encode('FFP1'));
    new DataView(buf.buffer).setUint32(4, head.length, true);
    buf.set(head, 8);
    let off = 8 + head.length;
    for (const d of decoded) { buf.set(d.data, off); off += d.data.length; }
    st.step = 'gzip';
    const gz = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
    window.__ffb64 = 'FFGZ:' + btoa(bin);
    st.raw = total; st.gz = gz.length; st.images = keys.length; st.ms = Date.now() - t0;
    st.warnings = ir.warnings;
    st.step = 'ready'; st.done = true;
  } catch (e) {
    st.error = st.step + ': ' + String(e && e.stack || e);
    st.done = true;
  }
}
window.__ffextract = extract;
window.__ffrun = ffRun;
window.__ffcopy = function () {
  const h = e => { e.clipboardData.setData('text/plain', window.__ffb64); e.preventDefault(); e.stopImmediatePropagation(); };
  window.addEventListener('copy', h, true);
  try { return document.execCommand('copy'); } finally { window.removeEventListener('copy', h, true); }
};
