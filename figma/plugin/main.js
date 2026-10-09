// Figlo Figma plugin entry. Appended after extract.js by tools/build_figma.ts.

const MAX_IMAGE = 1024; // Roblox downsizes anything bigger

figma.showUI(__html__, { width: 400, height: 680, themeColors: true });

function selectedRoot() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) return { error: 'Select exactly one frame.' };
  const n = sel[0];
  if (!CONTAINERS.has(n.type)) return { error: 'Select a frame, group or component.' };
  return { node: n };
}

// PNG bytes of a node's render at the image's export scale (extract.js, FF_SCREEN),
// shrunk further if the long side would pass MAX_IMAGE.
async function exportNode(node, w, h, want) {
  const scale = Math.min(want || 1, MAX_IMAGE / Math.max(w, h, 1));
  return withoutFoldAsync(node, () => node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } }));
}

// Drop shadow alone: export a childless temporary clone (the body is drawn natively on top).
async function exportShadow(node, w, h, want) {
  if (!('children' in node) || node.children.length === 0) return exportNode(node, w, h, want);
  const clone = childlessClone(node);
  try {
    return await exportNode(clone, w, h, want);
  } finally {
    clone.remove();
  }
}

async function imageBytes(key, info) {
  if (info.kind === 'hash') return imageFillBytes(info.hash);
  const node = await figma.getNodeByIdAsync(info.node);
  if (!node) throw new Error('node ' + info.node + ' not found');
  const bytes = info.kind === 'shadow' ? await exportShadow(node, info.w, info.h, info.scale) : await exportNode(node, info.w, info.h, info.scale);
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
    for (const tag of KNOWN_TAGS) {
      if (nameWithout(n.name, tag) === n.name) continue;
      if (!tags[tag]) tags[tag] = { count: 0, values: fx[tag] || (effectParams(n, { [tag]: true }) || {})[tag] || {} };
      tags[tag].count++;
      if (typeof meta.tags[tag] === 'string') tags[tag].value = meta.tags[tag];
    }
    if (n.name.startsWith('#')) { tags['#'] ||= { count: 0, values: {} }; tags['#'].count++; }
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

// `_tag` or `_tag:old` in the name becomes `_tag:value` (plain `_tag` for an empty value).
function setTagValue(tag, value) {
  const clean = String(value).trim().replace(/_/g, ' ');
  for (const n of figma.currentPage.selection) {
    const parts = n.name.split('_');
    for (let i = parts.length - 1; i > 0; i--) {
      const key = parts[i].split(':')[0].toLowerCase();
      if (!KNOWN_TAGS.has(key)) break;
      if (key === tag) { parts[i] = clean ? tag + ':' + clean : tag; break; }
    }
    n.name = parts.join('_');
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

// Guide previews are local; only this explicit action writes to the document.
function applyGuideTag(msg) {
  const tag = msg.tag;
  if (tag !== '#' && !KNOWN_TAGS.has(tag)) throw new Error('Unknown tag.');
  const selection = figma.currentPage.selection;
  if (!selection.length) throw new Error('Select a layer first.');
  const spec = EFFECTS[tag];
  const value = String(msg.value || '').trim();
  if (value.length > 80 || value.includes('_')) throw new Error('Tag values must be at most 80 characters and cannot contain underscores.');
  if (['goto', 'show', 'switch', 'when'].includes(tag) && !value) throw new Error('Enter a target or state first.');
  if (tag === 'when' && value.split('|').some(v => !['hover', 'press', 'rest', 'locked', 'active'].includes(v))) throw new Error('Use hover, press, rest, locked or active, separated by |.');
  const params = {};
  for (const [key, input] of Object.entries(msg.params || {})) {
    const p = spec && Object.prototype.hasOwnProperty.call(spec.params, key) && spec.params[key];
    if (!p) throw new Error('Unknown parameter: ' + key);
    if (p.type === 'text') {
      if (typeof input !== 'string' || input.length > 128) throw new Error('Invalid ' + p.label);
      if (key === 'color' && !/^#?[0-9a-f]{6}$/i.test(input)) throw new Error('Use a six-digit hex color.');
      if (/Sound$/.test(key) && !/^(?:rbxassetid:\/\/)?\d+$/.test(input)) throw new Error('Use a numeric sound asset ID, or 0 for silence.');
      params[key] = key === 'color' ? input.replace('#', '').toUpperCase() : input;
    } else {
      if (typeof input !== 'number' || !Number.isFinite(input) || input < p.min || input > p.max) throw new Error('Invalid ' + p.label);
      params[key] = input;
    }
  }
  // Validate the entire request before touching any selected layer.
  for (const node of selection) {
    if (tag === '#') {
      if (!node.name.startsWith('#')) node.name = '#' + node.name;
    } else {
      if (nameWithout(node.name, tag) === node.name) node.name += '_' + tag;
      if (spec && spec.value) {
        const parts = node.name.split('_');
        for (let i = parts.length - 1; i > 0; i--) {
          const key = parts[i].split(':')[0].toLowerCase();
          if (!KNOWN_TAGS.has(key)) break;
          if (key === tag) { parts[i] = value ? tag + ':' + value : tag; break; }
        }
        node.name = parts.join('_');
      }
      if (Object.keys(params).length) {
        const saved = readFx(node);
        const fx = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        const previous = fx[tag];
        fx[tag] = Object.assign(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}, params);
        node.setPluginData('fx', JSON.stringify(fx));
      }
    }
  }
}

figma.ui.onmessage = async msg => {
  if (msg.type === 'guide-apply') {
    try {
      applyGuideTag(msg);
      sendFxState();
      figma.ui.postMessage({ type: 'guide-applied', count: figma.currentPage.selection.length });
    } catch (e) {
      figma.ui.postMessage({ type: 'guide-applied', error: String(e && e.message || e) });
    }
    return;
  }
  if (msg.type === 'create-demo') {
    try {
      await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' });
      const paint = (r, g, b) => [{ type: 'SOLID', color: { r, g, b } }];
      const root = figma.createFrame(); root.name = 'Figlo Demo'; root.resize(640, 400);
      root.fills = paint(0.055, 0.075, 0.13); root.cornerRadius = 24;
      const box = (parent, name, x, y, w, h, fill, radius) => {
        const f = figma.createFrame(); parent.appendChild(f); f.name = name; f.resize(w, h); f.x = x; f.y = y; f.fills = fill; f.cornerRadius = radius; return f;
      };
      const text = (parent, name, value, x, y, w, size, style, fill) => {
        const t = figma.createText(); parent.appendChild(t); t.name = name; t.fontName = { family: 'Roboto', style }; t.fontSize = size;
        t.characters = value; t.resize(w, size * 1.5); t.x = x; t.y = y; t.fills = fill; return t;
      };
      text(root, 'Title_txt', 'Design. Import. Play.', 40, 40, 560, 36, 'Bold', paint(0.95, 0.97, 1));
      const card = box(root, 'Card_frame', 40, 122, 560, 156, paint(0.10, 0.14, 0.23), 16);
      const dot = figma.createEllipse(); card.appendChild(dot); dot.name = 'Dot_pulse'; dot.resize(64, 64); dot.x = 32; dot.y = 36; dot.fills = paint(0.35, 0.87, 0.76);
      text(card, 'Caption_txt', 'Figma to Roblox', 124, 34, 396, 26, 'Regular', paint(0.82, 0.87, 0.96));
      box(root, 'Continue_smooth', 40, 310, 560, 52, paint(0.35, 0.87, 0.76), 12);
      root.x = figma.viewport.center.x - 320; root.y = figma.viewport.center.y - 200;
      figma.currentPage.selection = [root]; figma.viewport.scrollAndZoomIntoView([root]);
      figma.ui.postMessage({ type: 'selection', name: root.name, error: null });
    } catch (e) { figma.ui.postMessage({ type: 'error', message: String(e && e.message || e) }); }
    return;
  }
  if (msg.type === 'selection?') {
    const r = selectedRoot();
    figma.ui.postMessage({ type: 'selection', name: r.node ? r.node.name : null, error: r.error || null });
    figma.ui.postMessage({ type: 'effects', spec: EFFECTS, knownTags: [...KNOWN_TAGS] });
    sendFxState();
    return;
  }
  if (msg.type === 'fx-toggle') { toggleTag(msg.tag); sendFxState(); return; }
  if (msg.type === 'fx-set') { setParam(msg.tag, msg.key, msg.value); return; }
  if (msg.type === 'fx-value') { setTagValue(msg.tag, msg.value); sendFxState(); return; }
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
