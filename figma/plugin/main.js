// FrameFig Figma plugin entry. Appended after extract.js by tools/build_figma.ts.

const MAX_IMAGE = 1024; // Roblox downsizes anything bigger

figma.showUI(__html__, { width: 320, height: 480, themeColors: true });

function selectedRoot() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return { error: 'Select exactly one frame.' };
  const n = sel[0];
  if (!CONTAINERS.has(n.type)) return { error: 'Select a frame, group or component.' };
  return { node: n };
}

// PNG bytes of a node's render, scaled so the long side fits MAX_IMAGE.
async function exportNode(node, w, h) {
  const scale = Math.min(1, MAX_IMAGE / Math.max(w, h, 1));
  return withoutFoldAsync(node, () => node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } }));
}

// Drop shadow alone: export a childless temporary clone (the body is drawn natively on top).
async function exportShadow(node, w, h) {
  if (!('children' in node) || node.children.length === 0) return exportNode(node, w, h);
  const clone = childlessClone(node);
  try {
    return await exportNode(clone, w, h);
  } finally {
    clone.remove();
  }
}

async function imageBytes(key, info) {
  if (info.kind === 'hash') {
    const img = figma.getImageByHash(info.hash);
    if (!img) throw new Error('image ' + info.hash + ' not found');
    const size = await img.getSizeAsync();
    return { bytes: await img.getBytesAsync(), nw: size.width, nh: size.height };
  }
  const node = await figma.getNodeByIdAsync(info.node);
  if (!node) throw new Error('node ' + info.node + ' not found');
  const bytes = info.kind === 'shadow' ? await exportShadow(node, info.w, info.h) : await exportNode(node, info.w, info.h);
  return { bytes };
}

// --- Effects tab: tags live in the layer name, their values in plugin data ---

function readFx(node) {
  try { return JSON.parse(node.getPluginData('fx') || '{}'); } catch (e) { return {}; }
}

function nameWithout(name, tag) {
  const parts = name.split('_');
  for (let i = parts.length - 1; i > 0; i--) {
    const key = parts[i].split(':')[0].toLowerCase();
    if (!KNOWN_TAGS.has(key)) break;
    if (key === tag) { parts.splice(i, 1); break; }
  }
  return parts.join('_');
}

function fxState() {
  const sel = figma.currentPage.selection;
  const tags = {};
  for (const n of sel) {
    const meta = parseName(n.name);
    const fx = effectParams(n, meta.tags) || {};
    for (const tag of Object.keys(EFFECTS)) {
      if (nameWithout(n.name, tag) === n.name) continue;
      if (!tags[tag]) tags[tag] = { count: 0, values: fx[tag] || effectParams(n, { [tag]: true })[tag] };
      tags[tag].count++;
    }
  }
  return { type: 'fx-state', count: sel.length, name: sel.length === 1 ? sel[0].name : null, tags };
}

function sendFxState() { figma.ui.postMessage(fxState()); }

function toggleTag(tag) {
  const sel = figma.currentPage.selection;
  const has = n => nameWithout(n.name, tag) !== n.name;
  const allHave = sel.length > 0 && sel.every(has);
  for (const n of sel) {
    if (allHave) {
      n.name = nameWithout(n.name, tag);
      const fx = readFx(n);
      delete fx[tag];
      n.setPluginData('fx', Object.keys(fx).length ? JSON.stringify(fx) : '');
    } else if (!has(n)) {
      n.name = n.name + '_' + tag;
    }
  }
}

function setParam(tag, key, value) {
  for (const n of figma.currentPage.selection) {
    if (nameWithout(n.name, tag) === n.name) continue;
    const fx = readFx(n);
    fx[tag] = Object.assign(fx[tag] || {}, { [key]: value });
    n.setPluginData('fx', JSON.stringify(fx));
  }
}

figma.ui.onmessage = async msg => {
  if (msg.type === 'selection?') {
    const r = selectedRoot();
    figma.ui.postMessage({ type: 'selection', name: r.node ? r.node.name : null, error: r.error || null });
    figma.ui.postMessage({ type: 'effects', spec: EFFECTS });
    sendFxState();
    return;
  }
  if (msg.type === 'fx-toggle') { toggleTag(msg.tag); sendFxState(); return; }
  if (msg.type === 'fx-set') { setParam(msg.tag, msg.key, msg.value); return; }
  if (msg.type === 'fx-reset') {
    for (const n of figma.currentPage.selection) {
      const fx = readFx(n);
      delete fx[msg.tag];
      n.setPluginData('fx', Object.keys(fx).length ? JSON.stringify(fx) : '');
    }
    sendFxState();
    return;
  }
  if (msg.type !== 'export') return;
  const r = selectedRoot();
  if (r.error) {
    figma.ui.postMessage({ type: 'error', message: r.error });
    return;
  }
  try {
    const t0 = Date.now();
    figma.ui.postMessage({ type: 'progress', message: 'Reading layers…' });
    const ir = extract(r.node);
    const keys = Object.keys(ir.images);
    const images = [];
    for (let i = 0; i < keys.length; i++) {
      figma.ui.postMessage({ type: 'progress', message: `Exporting image ${i + 1}/${keys.length}…` });
      const out = await imageBytes(keys[i], ir.images[keys[i]]);
      images.push({ key: keys[i], ...out });
    }
    figma.ui.postMessage({ type: 'payload', ir, images, ms: Date.now() - t0 });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String(e && e.message || e) });
  }
};

figma.on('selectionchange', () => {
  const r = selectedRoot();
  figma.ui.postMessage({ type: 'selection', name: r.node ? r.node.name : null, error: r.error || null });
  sendFxState();
});
