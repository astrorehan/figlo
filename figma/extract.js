// Figlo extractor: turns one Figma node into Figlo IR (plain JSON).
// Runs inside the Figma plugin sandbox, or pasted into the Figma web console
// where the `figma` global is available. It only reads the document.

const FF_IR_VERSION = 1;

// The screen images are sized for. A root fills the ScreenGui with its aspect kept,
// so on this screen it shows at min(w / design w, h / design h) of its design size.
// Roblox mipmaps every uploaded image and blends in the half-size level as soon as it
// is drawn smaller than its pixels, so an image is crispest when its pixels match
// what it covers on screen: baked images are exported at that scale (at most
// MAX_OVERSAMPLE), and the importer shrinks them further for a root resized in Studio.
// `_native` on a frame keeps design pixels for the images inside it (icon sheets
// whose ids are used by code at other sizes).
const FF_SCREEN = { w: 1920, h: 1080 };
const MAX_OVERSAMPLE = 2;

// Name suffixes we understand. `_a_b` → tags {a, b}; `_goto:Shop` → {goto: "Shop"}.
const KNOWN_TAGS = new Set([
  // structure
  'image', 'img', 'lock', 'frame', 'txt', 'keep', 'ignore', 'scroll', 'nodim', 'ratio', 'group', 'stack', 'tiles',
  'native',
  // buttons, button states and navigation
  'button', 'smooth', 'when', 'goto', 'show', 'hide', 'switch',
  // idle motion
  'spin', 'drift', 'float', 'wiggle', 'pulse', 'rays', 'blink', 'sway', 'wobble', 'jitter', 'halo', 'tide',
  // pointer
  'lift', 'tip', 'pull', 'sheen', 'splash',
  // entrances
  'pop', 'fade', 'slide', 'stagger',
  // light
  'shiny', 'gleam',
]);

// Tags that make a layer clickable.
const BUTTON_TAGS = ['smooth', 'goto', 'show', 'hide', 'switch'];

// Tunable effects. The plugin's Effects tab edits these per layer and stores them with
// setPluginData('fx', JSON); anything not set falls back to `def`.
const EFFECTS = {
  button: { hint: 'Clickable. Images inside darken on hover and press.', params: {
    hoverDim: { label: 'Hover brightness', def: 0.8, min: 0.3, max: 1, step: 0.01 },
    pressDim: { label: 'Press brightness', def: 0.62, min: 0.3, max: 1, step: 0.01 },
  } },
  smooth: { hint: 'Button grows on hover and shrinks on press, with sounds.', params: {
    hover: { label: 'Hover scale', def: 1.08, min: 1, max: 1.3, step: 0.01 },
    press: { label: 'Press scale', def: 0.9, min: 0.6, max: 1, step: 0.01 },
    time: { label: 'Tween time (s)', def: 0.15, min: 0.02, max: 1, step: 0.01 },
    hoverSound: { label: 'Hover sound id (0 = off)', def: '0', type: 'text' },
    clickSound: { label: 'Click sound id (0 = off)', def: '0', type: 'text' },
  } },
  shiny: { hint: 'A light band sweeps across this shape (keeps its rounded corners, stays under its text).', params: {
    time: { label: 'Sweep time (s)', def: 0.7, min: 0.1, max: 5, step: 0.05 },
    cooldown: { label: 'Pause (s)', def: 2, min: 0, max: 10, step: 0.1 },
    width: { label: 'Band width', def: 0.25, min: 0.05, max: 1, step: 0.01 },
    opacity: { label: 'Brightness', def: 0.5, min: 0.05, max: 1, step: 0.05 },
    angle: { label: 'Tilt (deg)', def: 20, min: -60, max: 60, step: 1 },
  } },
  gleam: { hint: 'A white light sweeps across the text, fill and outline.', params: {
    time: { label: 'Sweep time (s)', def: 0.8, min: 0.1, max: 5, step: 0.05 },
    cooldown: { label: 'Pause (s)', def: 2, min: 0, max: 10, step: 0.1 },
    width: { label: 'Band width', def: 0.22, min: 0.05, max: 1, step: 0.01 },
  } },
  drift: { hint: 'The tiled image fill scrolls forever.', params: {
    speed: { label: 'Speed (px/s)', def: 40, min: 0, max: 400, step: 1 },
    angle: { label: 'Direction (0 = up, 90 = right)', def: 270, min: 0, max: 359, step: 1 },
  } },
  rays: { hint: 'Turns forever and breathes a little (sun rays, burst behind a prize).', params: {
    speed: { label: 'Turn speed (deg/s)', def: 20, min: -360, max: 360, step: 1 },
    amp: { label: 'Breath (scale)', def: 0.06, min: 0, max: 0.5, step: 0.01 },
    rate: { label: 'Breaths per second', def: 0.5, min: 0.05, max: 4, step: 0.05 },
  } },
  spin: { hint: 'Turns forever.', params: {
    speed: { label: 'Turn speed (deg/s)', def: 90, min: -720, max: 720, step: 1 },
  } },
  pulse: { hint: 'Breathes: grows and shrinks forever.', params: {
    amp: { label: 'Grow (scale)', def: 0.05, min: 0, max: 0.5, step: 0.01 },
    rate: { label: 'Beats per second', def: 1, min: 0.05, max: 4, step: 0.05 },
  } },
  float: { hint: 'Bobs up and down forever (random phase per layer).', params: {
    amp: { label: 'Height (share of own height)', def: 0.06, min: 0, max: 0.5, step: 0.01 },
    rate: { label: 'Bobs per second', def: 0.45, min: 0.05, max: 4, step: 0.05 },
  } },
  blink: { hint: 'Twinkles: shrinks and fades in a loop (random phase per layer).', params: {
    rate: { label: 'Twinkles per second', def: 0.7, min: 0.05, max: 4, step: 0.05 },
    min: { label: 'Smallest scale', def: 0.55, min: 0, max: 1, step: 0.01 },
    fade: { label: 'Fade at smallest', def: 0.7, min: 0, max: 1, step: 0.05 },
  } },
  wiggle: { hint: 'Every few seconds, a short decaying shake.', params: {
    every: { label: 'Every (s)', def: 4, min: 0.5, max: 20, step: 0.1 },
    time: { label: 'Shake time (s)', def: 0.7, min: 0.1, max: 3, step: 0.05 },
    angle: { label: 'Angle (deg)', def: 10, min: 0, max: 45, step: 1 },
  } },
  pop: { hint: 'Pops in whenever it becomes visible.', params: {
    from: { label: 'Start scale', def: 0.8, min: 0, max: 1, step: 0.01 },
    time: { label: 'Time (s)', def: 0.3, min: 0.05, max: 2, step: 0.01 },
  } },
  sway: { hint: 'Rocks gently from side to side forever, like a hanging sign.', params: {
    angle: { label: 'Angle (deg)', def: 6, min: 0, max: 45, step: 1 },
    rate: { label: 'Swings per second', def: 0.4, min: 0.05, max: 4, step: 0.05 },
  } },
  wobble: { hint: 'Squashes and stretches forever, like jelly (frames and images).', params: {
    amp: { label: 'Stretch', def: 0.05, min: 0, max: 0.3, step: 0.01 },
    rate: { label: 'Wobbles per second', def: 1.2, min: 0.05, max: 4, step: 0.05 },
  } },
  jitter: { hint: 'Every few seconds, a short shiver in place.', params: {
    every: { label: 'Every (s)', def: 3, min: 0.3, max: 20, step: 0.1 },
    time: { label: 'Shiver time (s)', def: 0.35, min: 0.05, max: 3, step: 0.05 },
    amount: { label: 'Distance (share of own height)', def: 0.04, min: 0, max: 0.5, step: 0.01 },
  } },
  halo: { hint: 'A soft outline that brightens and dims forever (the text outline on text layers).', params: {
    color: { label: 'Colour (hex)', def: 'FFFFFF', type: 'text' },
    size: { label: 'Thickness (px)', def: 6, min: 1, max: 40, step: 1 },
    rate: { label: 'Beats per second', def: 0.8, min: 0.05, max: 4, step: 0.05 },
    low: { label: 'Dimmest', def: 0.15, min: 0, max: 1, step: 0.05 },
    high: { label: 'Brightest', def: 0.7, min: 0, max: 1, step: 0.05 },
  } },
  tide: { hint: "Slides the layer's gradient fill back and forth (and turns it, if set).", params: {
    amp: { label: 'Slide', def: 0.3, min: 0, max: 1, step: 0.01 },
    rate: { label: 'Slides per second', def: 0.25, min: 0.02, max: 4, step: 0.01 },
    turn: { label: 'Turn (deg/s)', def: 0, min: -360, max: 360, step: 1 },
  } },
  lift: { hint: 'Rises a little while the pointer is over it (or over its button).', params: {
    amount: { label: 'Height (share of own height)', def: 0.08, min: 0, max: 1, step: 0.01 },
    time: { label: 'Ease time (s)', def: 0.15, min: 0.02, max: 1, step: 0.01 },
  } },
  tip: { hint: 'Leans toward the pointer while hovered.', params: {
    angle: { label: 'Angle (deg)', def: 6, min: 0, max: 45, step: 1 },
    time: { label: 'Ease time (s)', def: 0.15, min: 0.02, max: 1, step: 0.01 },
  } },
  pull: { hint: 'Follows the pointer a little while hovered.', params: {
    strength: { label: 'Strength', def: 0.12, min: 0, max: 1, step: 0.01 },
    time: { label: 'Ease time (s)', def: 0.12, min: 0.02, max: 1, step: 0.01 },
  } },
  sheen: { hint: 'One light sweep across the shape each time the pointer enters.', params: {
    time: { label: 'Sweep time (s)', def: 0.5, min: 0.1, max: 3, step: 0.05 },
    width: { label: 'Band width', def: 0.3, min: 0.05, max: 1, step: 0.01 },
    opacity: { label: 'Brightness', def: 0.6, min: 0.05, max: 1, step: 0.05 },
    angle: { label: 'Tilt (deg)', def: 20, min: -60, max: 60, step: 1 },
  } },
  splash: { hint: 'A circle spreads from where the button is pressed.', params: {
    color: { label: 'Colour (hex)', def: 'FFFFFF', type: 'text' },
    opacity: { label: 'Opacity', def: 0.35, min: 0.05, max: 1, step: 0.05 },
    time: { label: 'Time (s)', def: 0.45, min: 0.1, max: 2, step: 0.05 },
  } },
  fade: { hint: 'Fades in whenever it becomes visible.', params: {
    time: { label: 'Time (s)', def: 0.35, min: 0.05, max: 3, step: 0.05 },
  } },
  slide: { hint: 'Slides into place whenever it becomes visible.', params: {
    distance: { label: 'Distance (share of parent)', def: 0.25, min: 0, max: 2, step: 0.01 },
    angle: { label: 'Comes from (0 = above, 90 = right)', def: 180, min: 0, max: 359, step: 1 },
    time: { label: 'Time (s)', def: 0.4, min: 0.05, max: 3, step: 0.05 },
  } },
  stagger: { hint: 'Its children pop in one after another whenever it becomes visible.', params: {
    gap: { label: 'Delay between (s)', def: 0.06, min: 0, max: 1, step: 0.01 },
    from: { label: 'Start scale', def: 0, min: 0, max: 1, step: 0.01 },
    time: { label: 'Time each (s)', def: 0.25, min: 0.05, max: 2, step: 0.01 },
  } },
  // Tags whose value lives in the name (`_goto:Shop`); the plugin edits it as text.
  when: { hint: "Shown only in one state of the button it sits in: hover, press, rest, locked or active (several: hover|press).", value: 'State', params: {} },
  goto: { hint: 'Button: shows the named page (or layer) and hides its sibling pages.', value: 'Page or layer', params: {} },
  show: { hint: 'Button: shows the named layer, page or Figlo ScreenGui.', value: 'Layer', params: {} },
  hide: { hint: 'Button: hides the named layer; with no name, closes its ScreenGui.', value: 'Layer (optional)', params: {} },
  switch: { hint: 'Button: shows the named layer if hidden, hides it if shown.', value: 'Layer', params: {} },
  // Structure, no values.
  txt: { hint: 'Text your code will change: it shrinks to stay inside its box.', params: {} },
  ratio: { hint: 'Keeps its Figma width-to-height ratio on any screen.', params: {} },
  group: { hint: 'Becomes a CanvasGroup, so it and its children fade as one.', params: {} },
  stack: { hint: 'Auto-layout frame: children are laid out by Roblox, so rows your code adds line up.', params: {} },
  tiles: { hint: 'Wrapping auto-layout frame: children sit in a grid of equal cells.', params: {} },
};

// Effect values for the tags on a node, defaults filled in.
function effectParams(n, tags) {
  let saved = {};
  try { saved = JSON.parse(n.getPluginData('fx') || '{}'); } catch (e) { saved = {}; }
  const out = {};
  for (const tag of Object.keys(tags)) {
    const spec = EFFECTS[tag];
    if (!spec || !Object.keys(spec.params).length) continue;
    const vals = {};
    for (const [k, p] of Object.entries(spec.params)) {
      const v = saved[tag] && saved[tag][k];
      vals[k] = v !== undefined && typeof v === typeof p.def ? v : p.def;
    }
    out[tag] = vals;
  }
  return Object.keys(out).length ? out : null;
}

const VECTORISH = new Set(['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION', 'ELLIPSE']);
const CONTAINERS = new Set(['GROUP', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION']);
const DESCENDER_CHARS = /[gjpqyQ,;()\[\]{}\/|@$_]/;

function parseName(raw) {
  let name = raw.trim();
  let bake = false;
  if (name.startsWith('#')) { bake = true; name = name.slice(1); }
  const parts = name.split('_');
  const tags = {};
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    const colon = last.indexOf(':');
    const key = (colon >= 0 ? last.slice(0, colon) : last).toLowerCase();
    if (!KNOWN_TAGS.has(key)) break;
    tags[key] = colon >= 0 ? last.slice(colon + 1) : true;
    parts.pop();
  }
  if (tags.image || tags.img || tags.lock) bake = true;
  if (BUTTON_TAGS.some(t => tags[t])) tags.button = true;
  // A short lowercase word after the last '_' reads as a tag the author meant
  // (`Rays_breath`); report it instead of silently keeping it in the name.
  let unknown = null;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^[a-z][a-z0-9]{1,11}(:.*)?$/.test(last)) unknown = last.split(':')[0];
  }
  return { name: parts.join('_') || name, tags, bake, unknown };
}

// Pixel size from PNG / JPEG / GIF / WebP header bytes, for when Figma's
// getSizeAsync fails ("Image dimensions not available" on fills not yet loaded).
function imageSizeFromBytes(b) {
  const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u32(16), height: u32(20) };
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
      }
      i += 2 + len;
    }
  }
  if (b.length > 30 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === 'VP8 ') return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

// Bytes and pixel size of an image fill. Loading the bytes first also makes
// getSizeAsync work on fills the page has not drawn yet.
async function imageFillBytes(hash) {
  const img = figma.getImageByHash(hash);
  if (!img) throw new Error('image ' + hash + ' not found');
  const bytes = await img.getBytesAsync();
  let size = null;
  try { size = await img.getSizeAsync(); } catch (e) { size = imageSizeFromBytes(bytes); }
  if (!size) throw new Error('image ' + hash + ': size unknown');
  return { bytes, nw: size.width, nh: size.height };
}

// --- geometry -------------------------------------------------------------

// Oriented box in root space: centre, size, clockwise rotation in degrees.
function nodeBox(n, origin) {
  const [[a, b, tx], [c, d, ty]] = n.absoluteTransform;
  const w = n.width, h = n.height;
  return {
    cx: a * w / 2 + b * h / 2 + tx - origin.x,
    cy: c * w / 2 + d * h / 2 + ty - origin.y,
    w, h,
    rot: Math.atan2(c, a) * 180 / Math.PI,
  };
}

// Render bounds cut by clipping ancestors, which is exactly the area exportAsync returns.
function renderBox(n, origin) {
  return withoutFold(n, () => clippedBox(n, origin));
}

function clippedBox(n, origin) {
  const r = n.absoluteRenderBounds || n.absoluteBoundingBox;
  let x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
  for (let p = n.parent; p && p.type !== 'PAGE' && p.type !== 'DOCUMENT'; p = p.parent) {
    if (!p.clipsContent || !p.absoluteBoundingBox) continue;
    const c = p.absoluteBoundingBox;
    x0 = Math.max(x0, c.x); y0 = Math.max(y0, c.y);
    x1 = Math.min(x1, c.x + c.width); y1 = Math.min(y1, c.y + c.height);
  }
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
  return { cx: x0 + w / 2 - origin.x, cy: y0 + h / 2 - origin.y, w, h, rot: 0 };
}

function rectBox(x, y, w, h) {
  return { cx: x + w / 2, cy: y + h / 2, w, h, rot: 0 };
}

// Express `box` relative to `parent` the way Roblox wants it: centre and size
// as fractions of the parent, rotation relative to the parent's.
function relative(box, parent) {
  const t = -parent.rot * Math.PI / 180;
  const dx = box.cx - parent.cx, dy = box.cy - parent.cy;
  const lx = dx * Math.cos(t) - dy * Math.sin(t);
  const ly = dx * Math.sin(t) + dy * Math.cos(t);
  let rot = box.rot - parent.rot;
  rot = ((rot + 540) % 360) - 180;
  if (Math.abs(rot) < 0.05) rot = 0;
  return {
    x: round(0.5 + lx / parent.w), y: round(0.5 + ly / parent.h),
    w: round(box.w / parent.w), h: round(box.h / parent.h),
    rot: round(rot, 2),
  };
}

function round(v, digits = 5) {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}

function isFlipped(n) {
  const [[a, b], [c, d]] = n.absoluteTransform;
  return a * d - b * c < 0;
}

// --- paints ---------------------------------------------------------------

const visible = arr => (Array.isArray(arr) ? arr.filter(p => p.visible !== false && (p.opacity ?? 1) > 0) : []);
const rgb = c => [round(c.r, 4), round(c.g, 4), round(c.b, 4)];

// Figma: t(p) = row0 · (px, py, 1) over normalised node space. Roblox UIGradient
// spans the object along its rotated axis, so resample the stops onto that axis.
function linearGradient(paint) {
  const [[ga, gb, gc]] = paint.gradientTransform;
  const len = Math.hypot(ga, gb);
  if (len < 1e-6) return null;
  const rot = Math.atan2(gb, ga) * 180 / Math.PI;
  const dir = [ga / len, gb / len];
  const span = Math.abs(dir[0]) + Math.abs(dir[1]);
  const tCentre = ga * 0.5 + gb * 0.5 + gc;
  const tAt = u => tCentre + (u - 0.5) * span * len;
  const uAt = t => 0.5 + (t - tCentre) / (span * len);
  const stops = paint.gradientStops;
  const sample = t => {
    if (t <= stops[0].position) return stops[0].color;
    for (let i = 1; i < stops.length; i++) {
      const s0 = stops[i - 1], s1 = stops[i];
      if (t <= s1.position) {
        const f = (t - s0.position) / Math.max(1e-6, s1.position - s0.position);
        const mix = k => s0.color[k] + (s1.color[k] - s0.color[k]) * f;
        return { r: mix('r'), g: mix('g'), b: mix('b'), a: mix('a') };
      }
    }
    return stops[stops.length - 1].color;
  };
  const us = new Set([0, 1]);
  for (const s of stops) { const u = uAt(s.position); if (u > 0 && u < 1) us.add(round(u, 4)); }
  const keys = [...us].sort((a, b) => a - b).slice(0, 20).map(u => {
    const c = sample(tAt(u));
    return [u, round(c.r, 4), round(c.g, 4), round(c.b, 4), round(c.a * (paint.opacity ?? 1), 4)];
  });
  return { rot: round(rot, 2), keys };
}

function solidOrGradient(paints) {
  const vis = visible(paints);
  if (vis.length === 0) return { ok: true, value: null };
  if (vis.length > 1) return { ok: false, why: 'multiple fills' };
  const p = vis[0];
  if (p.blendMode && p.blendMode !== 'NORMAL' && p.blendMode !== 'PASS_THROUGH') return { ok: false, why: 'fill blend mode' };
  if (p.type === 'SOLID') return { ok: true, value: { c: rgb(p.color), a: round(p.opacity ?? 1, 4) } };
  if (p.type === 'GRADIENT_LINEAR') {
    const g = linearGradient(p);
    return g ? { ok: true, value: { grad: g } } : { ok: false, why: 'degenerate gradient' };
  }
  return { ok: false, why: p.type.toLowerCase() + ' fill' };
}

function strokeOf(n) {
  const vis = visible(n.strokes);
  if (vis.length === 0 || !n.strokeWeight) return { ok: true, value: null };
  if (vis.length > 1) return { ok: false, why: 'multiple strokes' };
  if (typeof n.strokeWeight !== 'number') return { ok: false, why: 'per-side stroke' };
  if (n.dashPattern && n.dashPattern.length) return { ok: false, why: 'dashed stroke' };
  const p = vis[0];
  if (p.type !== 'SOLID') return { ok: false, why: 'non-solid stroke' };
  return { ok: true, value: { w: n.strokeWeight, c: rgb(p.color), a: round(p.opacity ?? 1, 4), align: n.strokeAlign } };
}

function cornerOf(n) {
  if (!('cornerRadius' in n)) return { ok: true, value: 0 };
  if (typeof n.cornerRadius !== 'number') return { ok: false, why: 'mixed corner radius' };
  return { ok: true, value: n.cornerRadius };
}

// Figma auto-layout, for `_stack` / `_tiles` frames. Pixels; the builder converts.
function layoutOf(n) {
  if (!('layoutMode' in n) || n.layoutMode === 'NONE' || n.layoutMode === 'GRID') return null;
  const align = v => (v === 'CENTER' || v === 'MAX' || v === 'SPACE_BETWEEN' ? v : 'MIN');
  return {
    dir: n.layoutMode, // HORIZONTAL | VERTICAL
    wrap: n.layoutWrap === 'WRAP',
    gap: typeof n.itemSpacing === 'number' ? n.itemSpacing : 0,
    gapCross: typeof n.counterAxisSpacing === 'number' ? n.counterAxisSpacing : 0,
    pad: [n.paddingLeft || 0, n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0],
    main: align(n.primaryAxisAlignItems),
    cross: align(n.counterAxisAlignItems),
  };
}

function effectsOf(n) {
  const fx = visible(n.effects);
  const shadows = fx.filter(e => e.type === 'DROP_SHADOW');
  const other = fx.filter(e => e.type !== 'DROP_SHADOW');
  return { shadows, other };
}

// --- classification -------------------------------------------------------

// Why a node cannot be built natively (null = it can).
function bakeReason(n, meta) {
  if (meta.bake) return 'tagged image';
  if (isFlipped(n)) return 'mirrored';
  if (n.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(n.blendMode)) return 'blend mode';
  const { shadows, other } = effectsOf(n);
  if (other.length) return other[0].type.toLowerCase().replace('_', ' ');
  if (n.type === 'ELLIPSE') {
    const circle = Math.abs(n.width - n.height) < 0.5 && !n.arcData?.innerRadius && (n.arcData?.endingAngle - n.arcData?.startingAngle >= 6.28);
    if (!circle) return 'ellipse shape';
  } else if (VECTORISH.has(n.type)) {
    return 'vector';
  }
  if (n.type === 'TEXT') return textBakeReason(n, shadows);
  if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE' || CONTAINERS.has(n.type)) {
    const fills = visible(n.fills);
    if (fills.length === 1 && fills[0].type === 'IMAGE') {
      const f = fills[0];
      const plain = !f.rotation && Object.values(f.filters || {}).every(v => !v);
      if (!plain) return 'image fill adjustments';
      if (CONTAINERS.has(n.type)) return 'container image fill';
    } else {
      const fill = solidOrGradient(n.fills);
      if (!fill.ok) return fill.why;
    }
    const stroke = strokeOf(n);
    if (!stroke.ok) return stroke.why;
    const corner = cornerOf(n);
    if (!corner.ok) return corner.why;
    if (shadows.some(s => s.showShadowBehindNode)) return 'shadow behind node';
  }
  return null;
}

function textBakeReason(n, shadows) {
  const mixed = v => typeof v === 'symbol';
  if (mixed(n.fontName) || mixed(n.fontSize) || mixed(n.letterSpacing) || mixed(n.lineHeight)) return 'mixed text styles';
  if (mixed(n.fills)) {
    // Colour-only mixes become Roblox rich text; anything else is baked.
    const segs = n.getStyledTextSegments(['fills']);
    const solid = segs.every(g => { const v = visible(g.fills); return v.length === 1 && v[0].type === 'SOLID'; });
    if (!solid) return 'mixed text fills';
  }
  if (n.letterSpacing.value !== 0) return 'letter spacing';
  if (n.textDecoration && n.textDecoration !== 'NONE') return 'text decoration';
  if (n.textCase === 'SMALL_CAPS' || n.textCase === 'SMALL_CAPS_FORCED') return 'small caps';
  if (!mixed(n.fills)) {
    const fill = solidOrGradient(n.fills);
    if (!fill.ok) return fill.why;
  }
  const stroke = strokeOf(n);
  if (!stroke.ok) return stroke.why;
  if (shadows.length > 1 || shadows.some(s => s.radius > 0 || s.spread)) return 'blurred text shadow';
  return null;
}

// A container whose visible leaves all need baking and carry no tags is exported
// as one image (fewer uploads, identical look).
function flattenable(n) {
  let leaves = 0;
  let ok = true;
  (function walk(node) {
    if (!ok) return;
    for (const ch of node.children) {
      if (ch.visible === false) continue;
      const meta = parseName(ch.name);
      if (Object.keys(meta.tags).length) { ok = false; return; }
      if ('children' in ch && CONTAINERS.has(ch.type)) { walk(ch); continue; }
      if (ch.type === 'TEXT' || ch.isMask) { ok = false; return; }
      if (!bakeReason(ch, meta)) { ok = false; return; }
      leaves++;
    }
  })(n);
  return ok && leaves > 0;
}

function singleLeafId(n) {
  let leaf = n;
  while ('children' in leaf) {
    const vis = leaf.children.filter(c => c.visible !== false);
    if (vis.length !== 1) return null;
    leaf = vis[0];
  }
  return leaf.id;
}

// A copy of a frame without its children, in the same place as the original.
// Used for drop-shadow and background images; the caller removes it.
function childlessClone(n) {
  const clone = n.clone();
  const p = clone.parent;
  if (p !== n.parent) {
    // Clones of nodes inside an instance land on the page: place it absolutely.
    clone.relativeTransform = n.absoluteTransform;
  } else if (p && 'layoutMode' in p && p.layoutMode !== 'NONE') {
    clone.layoutPositioning = 'ABSOLUTE';
    clone.relativeTransform = n.relativeTransform;
  }
  // A hug-contents auto-layout frame collapses once its children go: freeze it first.
  if ('layoutMode' in clone && clone.layoutMode !== 'NONE') clone.layoutMode = 'NONE';
  for (const ch of [...clone.children]) ch.remove();
  if (Math.abs(clone.width - n.width) > 0.01 || Math.abs(clone.height - n.height) > 0.01) clone.resize(n.width, n.height);
  return clone;
}

// Frame-level looks Figlo cannot draw natively but that do not touch the
// children: bake them into a background image and keep the children live.
const BG_REASONS = /inner shadow|background blur|fill|stroke|mixed corner radius|shadow behind node/;

// Unclipped extent of a node (bounding box grown by drop shadows and, for
// non-clipping containers, by their children). absoluteRenderBounds cannot be
// used here: it is already cut by clipping ancestors.
function extentOf(n) {
  const b = n.absoluteBoundingBox;
  if (!b) return null;
  let x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
  for (const e of visible(n.effects)) {
    if (e.type !== 'DROP_SHADOW') continue;
    const k = e.radius + (e.spread || 0);
    x0 = Math.min(x0, b.x + e.offset.x - k); y0 = Math.min(y0, b.y + e.offset.y - k);
    x1 = Math.max(x1, b.x + b.width + e.offset.x + k); y1 = Math.max(y1, b.y + b.height + e.offset.y + k);
  }
  if ('children' in n && !n.clipsContent && !VECTORISH.has(n.type)) {
    for (const c of n.children) {
      if (c.visible === false || c.isMask) continue;
      const r = extentOf(c);
      if (!r) continue;
      x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]);
    }
  }
  return [x0, y0, x1, y1];
}

// Does clipping this frame change anything? Figma frames clip by default, so
// most clips are accidental; each one costs a Frame, and a rounded one a CanvasGroup.
function overflows(n) {
  const b = n.absoluteBoundingBox;
  for (const c of n.children) {
    if (c.visible === false) continue;
    const r = extentOf(c);
    if (!r) continue;
    if (r[0] < b.x - 0.5 || r[1] < b.y - 0.5 || r[2] > b.x + b.width + 0.5 || r[3] > b.y + b.height + 0.5) return true;
  }
  return false;
}

// Rounded clips need a CanvasGroup; below this radius a plain clipping Frame looks the same.
const SMALL_RADIUS = 12;

// --- IR construction ------------------------------------------------------

// A `_scroll` frame clips in Figma, but in Roblox its whole canvas is reachable.
// Content below the fold is hidden by the scroll frame and by every clipping
// frame above it, so it measures and exports as nothing (a 1x1 PNG). Lift exactly
// those clips while measuring or exporting one node, then put them back.
function foldClippers(n) {
  const out = [];
  let inScroll = false;
  for (let p = n.parent; p && p.type !== 'PAGE' && p.type !== 'DOCUMENT'; p = p.parent) {
    if (!inScroll && parseName(p.name).tags.scroll) inScroll = true;
    if (inScroll && p.clipsContent) out.push(p);
  }
  return out;
}

function withoutFold(n, f) {
  const lifted = foldClippers(n);
  for (const p of lifted) p.clipsContent = false;
  try { return f(); } finally { for (const p of lifted) p.clipsContent = true; }
}

async function withoutFoldAsync(n, f) {
  const lifted = foldClippers(n);
  for (const p of lifted) p.clipsContent = false;
  try { return await f(); } finally { for (const p of lifted) p.clipsContent = true; }
}

function extract(rootNode) {
  const rb = rootNode.absoluteBoundingBox;
  const origin = { x: rb.x, y: rb.y };
  const images = new Map();
  const warnings = [];
  const fontsUsed = new Set();
  const unknownTags = new Map(); // suffix -> layer names
  function noteUnknown(n, meta) {
    if (!meta.unknown) return;
    if (!unknownTags.has(meta.unknown)) unknownTags.set(meta.unknown, []);
    unknownTags.get(meta.unknown).push(n.name);
  }

  const rootBox = { cx: rb.width / 2, cy: rb.height / 2, w: rb.width, h: rb.height, rot: 0 };

  function addImage(key, info) {
    if (!images.has(key)) images.set(key, info);
    return key;
  }

  function base(n, meta, box, parentBox) {
    const ir = { id: n.id, name: meta.name, ...relative(box, parentBox), pw: round(box.w, 2), ph: round(box.h, 2) };
    if (Object.keys(meta.tags).length) ir.tags = meta.tags;
    const fx = effectParams(n, meta.tags);
    if (fx) ir.fx = fx;
    const op = n.opacity ?? 1;
    if (op < 1) ir.opacity = round(op, 4);
    return ir;
  }

  function imageNode(n, meta, parentBox, why) {
    const box = renderBox(n, origin);
    const ir = base(n, meta, box, parentBox);
    ir.kind = 'image';
    ir.why = why;
    delete ir.opacity; // exportAsync bakes layer opacity
    ir.image = addImage(n.id, { kind: 'export', node: n.id, w: Math.round(box.w), h: Math.round(box.h) });
    const leaf = singleLeafId(n);
    if (leaf && leaf !== n.id) ir.alt = [leaf];
    if (meta.tags.button) ir.button = true;
    return ir;
  }

  function textNode(n, meta, parentBox) {
    const box = nodeBox(n, origin);
    const ir = base(n, meta, box, parentBox);
    ir.kind = 'text';
    const s = n.fontSize;
    const lh = n.lineHeight;
    let text = n.characters;
    if (n.textCase === 'UPPER') text = text.toUpperCase();
    else if (n.textCase === 'LOWER') text = text.toLowerCase();
    let fill, rich = null;
    if (typeof n.fills === 'symbol') {
      rich = n.getStyledTextSegments(['fills']).map(g => {
        let t = g.characters;
        if (n.textCase === 'UPPER') t = t.toUpperCase();
        else if (n.textCase === 'LOWER') t = t.toLowerCase();
        const p = visible(g.fills)[0];
        return { s: t, c: rgb(p.color), a: round(p.opacity ?? 1, 4) };
      });
      fill = { c: rich[0].c, a: rich[0].a };
    } else {
      fill = solidOrGradient(n.fills).value;
    }
    const stroke = strokeOf(n).value;
    // Ink box without stroke, to count rendered lines.
    const r = withoutFold(n, () => n.absoluteRenderBounds);
    const pad = stroke ? (stroke.align === 'OUTSIDE' ? stroke.w : stroke.align === 'CENTER' ? stroke.w / 2 : 0) : 0;
    const inkH = r ? r.height - 2 * pad : n.height;
    const inkW = r ? r.width - 2 * pad : n.width;
    const lineOf = lh.unit === 'PIXELS' ? { px: lh.value } : lh.unit === 'PERCENT' ? { px: s * lh.value / 100 } : { auto: true };
    const hardLines = text.split('\n').length;
    fontsUsed.add(n.fontName.family);
    ir.text = {
      value: text,
      family: n.fontName.family,
      style: n.fontName.style,
      size: s,
      lineHeight: lineOf,
      alignX: n.textAlignHorizontal,
      alignY: n.textAlignVertical,
      autoResize: n.textAutoResize,
      hardLines,
      inkW: round(inkW, 2),
      inkH: round(inkH, 2),
      noDescenders: !DESCENDER_CHARS.test(text),
      fill,
      stroke,
    };
    if (rich) ir.text.rich = rich;
    const { shadows } = effectsOf(n);
    if (shadows.length) {
      const sh = shadows[0];
      ir.text.shadow = { x: sh.offset.x, y: sh.offset.y, c: rgb(sh.color), a: round(sh.color.a, 4) };
    }
    if (meta.tags.button) ir.button = true;
    return ir;
  }

  function shapeNode(n, meta, parentBox) {
    const box = nodeBox(n, origin);
    const ir = base(n, meta, box, parentBox);
    const fills = visible(n.fills);
    if (fills.length === 1 && fills[0].type === 'IMAGE') {
      const f = fills[0];
      ir.kind = 'image';
      ir.image = addImage('hash:' + f.imageHash, { kind: 'hash', hash: f.imageHash });
      ir.scale = f.scaleMode; // FILL | FIT | CROP | TILE
      if (f.scaleMode === 'TILE') ir.tileScale = f.scalingFactor;
      ir.imageAlpha = round(f.opacity ?? 1, 4);
    } else {
      ir.kind = 'frame';
      const fill = solidOrGradient(n.fills).value;
      if (fill) ir.fill = fill;
    }
    if (n.type === 'ELLIPSE') ir.radius = Math.min(n.width, n.height) / 2;
    else if (cornerOf(n).value) ir.radius = n.cornerRadius;
    const stroke = strokeOf(n).value;
    if (stroke) ir.stroke = stroke;
    if (meta.tags.button) ir.button = true;
    return ir;
  }

  // Children of `n`, grouped so everything after a mask sits inside a clip node.
  function buildChildren(n, ownBox) {
    const out = [];
    let target = out;
    let clipBox = ownBox;
    for (const ch of n.children) {
      if (ch.visible === false) continue;
      if (ch.isMask) {
        const maskMeta = parseName(ch.name);
        const mBox = nodeBox(ch, origin);
        const radius = ch.type === 'ELLIPSE' ? Math.min(ch.width, ch.height) / 2 : (typeof ch.cornerRadius === 'number' ? ch.cornerRadius : 0);
        if (!(ch.type === 'RECTANGLE' || ch.type === 'ELLIPSE' || ch.type === 'FRAME')) {
          warnings.push(`${ch.name}: ${ch.type} mask approximated by its bounding box`);
        }
        const clip = { ...relative(mBox, ownBox), id: ch.id, name: maskMeta.name + 'Mask', kind: radius > SMALL_RADIUS ? 'canvas' : 'clip', pw: round(mBox.w, 2), ph: round(mBox.h, 2), children: [] };
        if (radius > SMALL_RADIUS) clip.radius = radius;
        out.push(clip);
        target = clip.children;
        clipBox = mBox;
        continue;
      }
      const built = build(ch, clipBox);
      if (built) target.push(...built);
    }
    return out.filter(c => !(c.kind === 'clip' || c.kind === 'canvas') || c.children.length > 0);
  }

  // Returns an array: some Figma nodes become two Roblox nodes (e.g. shadow + body).
  function build(n, parentBox) {
    if (n.visible === false) return null;
    const meta = parseName(n.name);
    if (meta.tags.ignore) return null;
    noteUnknown(n, meta);

    if (CONTAINERS.has(n.type)) {
      let why = bakeReason(n, meta);
      let bg = null;
      if (why && !meta.bake && n.type !== 'GROUP' && BG_REASONS.test(why) && !flattenable(n)) {
        bg = bgNode(n, meta, parentBox, why);
        why = null;
      }
      if (why) return [imageNode(n, meta, parentBox, why)];
      const live = ['button', 'frame', 'keep', 'scroll', 'stack', 'tiles', 'group', 'stagger'].some(t => meta.tags[t]);
      if (!live && flattenable(n)) return [imageNode(n, meta, parentBox, 'vector group')];
      const box = nodeBox(n, origin);
      const ir = base(n, meta, box, parentBox);
      ir.kind = 'frame';
      if (meta.tags.button) ir.button = true;
      if (meta.tags.stack || meta.tags.tiles) {
        const layout = layoutOf(n);
        if (layout) ir.layout = layout;
        else warnings.push(`${n.name}: _${meta.tags.stack ? 'stack' : 'tiles'} needs an auto-layout frame, ignored`);
        for (const c of n.children) {
          if (c.visible !== false && !c.isMask && effectsOf(c).shadows.length) {
            warnings.push(`${n.name}: child ${c.name} has a drop shadow, which becomes an extra cell of the layout; bake it with _image`);
          }
        }
      }
      const radius = n.type !== 'GROUP' && cornerOf(n).value ? n.cornerRadius : 0;
      if (n.type !== 'GROUP' && !bg) {
        const fill = solidOrGradient(n.fills).value;
        if (fill) ir.fill = fill;
        if (radius) ir.radius = radius;
        const stroke = strokeOf(n).value;
        if (stroke) ir.stroke = stroke;
      }
      const out = [];
      if (bg) out.push(bg);
      const { shadows } = effectsOf(n);
      if (!bg && shadows.length && n.type !== 'GROUP') out.push(shadowNode(n, meta, parentBox, shadows));
      if (meta.tags.scroll) {
        // ScrollingFrame: children sit on the canvas, which starts at the frame's
        // top-left and grows to hold everything inside.
        const b = n.absoluteBoundingBox;
        let cw = n.width, ch = n.height;
        for (const c of n.children) {
          if (c.visible === false) continue;
          const r = extentOf(c);
          if (r) { cw = Math.max(cw, r[2] - b.x); ch = Math.max(ch, r[3] - b.y); }
        }
        ir.kind = 'scroll';
        ir.canvasW = round(cw / n.width);
        ir.canvasH = round(ch / n.height);
        ir.scrollDir = n.overflowDirection || 'VERTICAL';
        ir.children = buildChildren(n, rectBox(b.x - origin.x, b.y - origin.y, cw, ch));
        out.push(ir);
        return out;
      }
      let kids = buildChildren(n, box);
      if (n.clipsContent && kids.length && overflows(n)) {
        const rounded = radius > SMALL_RADIUS;
        const clip = { id: n.id + ':clip', name: meta.name + 'Clip', x: 0.5, y: 0.5, w: 1, h: 1, rot: 0, pw: ir.pw, ph: ir.ph, kind: rounded ? 'canvas' : 'clip', children: kids };
        if (rounded) clip.radius = radius;
        kids = [clip];
      }
      ir.children = kids;
      out.push(ir);
      return out;
    }

    const why = bakeReason(n, meta);
    if (why) return [imageNode(n, meta, parentBox, why)];
    if (n.type === 'TEXT') return [textNode(n, meta, parentBox)];
    const out = [];
    const { shadows } = effectsOf(n);
    if (shadows.length) out.push(shadowNode(n, meta, parentBox, shadows));
    out.push(shapeNode(n, meta, parentBox));
    return out;
  }

  // Background look (fill, inner shadow, drop shadow...) as an image behind the
  // node's live children. The export is a childless clone, so measure one too.
  function bgNode(n, meta, parentBox, why) {
    const clone = childlessClone(n);
    let box;
    try { box = renderBox(clone, origin); } finally { clone.remove(); }
    const ir = { id: n.id + ':bg', name: meta.name + 'Bg', kind: 'image', why: 'background: ' + why, ...relative(box, parentBox), pw: round(box.w, 2), ph: round(box.h, 2) };
    ir.image = addImage('bg:' + n.id, { kind: 'shadow', node: n.id, w: Math.round(box.w), h: Math.round(box.h) });
    return ir;
  }

  // Drop shadow as its own image behind the node. The box must match what
  // exportAsync produces: the render bounds, already clipped by clipping ancestors.
  function shadowNode(n, meta, parentBox, shadows) {
    let box;
    if (withoutFold(n, () => n.absoluteRenderBounds)) {
      box = renderBox(n, origin);
    } else {
      const b = nodeBox(n, origin);
      let x0 = 0, y0 = 0, x1 = n.width, y1 = n.height;
      for (const s of shadows) {
        const e = s.radius + (s.spread || 0);
        x0 = Math.min(x0, s.offset.x - e); y0 = Math.min(y0, s.offset.y - e);
        x1 = Math.max(x1, n.width + s.offset.x + e); y1 = Math.max(y1, n.height + s.offset.y + e);
      }
      const left = b.cx - n.width / 2, top = b.cy - n.height / 2;
      box = rectBox(left + x0, top + y0, x1 - x0, y1 - y0);
    }
    const ir = { id: n.id + ':shadow', name: meta.name + 'Shadow', kind: 'image', why: 'drop shadow', ...relative(box, parentBox), pw: round(box.w, 2), ph: round(box.h, 2) };
    ir.image = addImage('shadow:' + n.id, { kind: 'shadow', node: n.id, w: Math.round(box.w), h: Math.round(box.h) });
    return ir;
  }

  const meta = parseName(rootNode.name);
  noteUnknown(rootNode, meta);
  const rootIr = { id: rootNode.id, name: meta.name, kind: 'frame', x: 0.5, y: 0.5, w: 1, h: 1, rot: 0, pw: rb.width, ph: rb.height };
  if (Object.keys(meta.tags).length) rootIr.tags = meta.tags;
  const rootFx = effectParams(rootNode, meta.tags);
  if (rootFx) rootIr.fx = rootFx;
  if (rootNode.type !== 'GROUP') {
    const fill = solidOrGradient(rootNode.fills).value;
    if (fill) rootIr.fill = fill;
    if (cornerOf(rootNode).value) rootIr.radius = rootNode.cornerRadius;
  }
  rootIr.children = buildChildren(rootNode, rootBox);

  // Export scale per image; `_native` (on any ancestor) keeps design pixels.
  const fit = Math.min(MAX_OVERSAMPLE, FF_SCREEN.w / rb.width, FF_SCREEN.h / rb.height);
  for (const info of images.values()) info.scale = fit;
  (function markNative(n, native) {
    native = native || !!(n.tags && n.tags.native);
    if (native && n.kind === 'image' && n.image) {
      n.native = true;
      const info = images.get(n.image);
      if (info) info.scale = 1;
    }
    for (const c of n.children || []) markNative(c, native);
  })(rootIr, false);

  for (const [tag, names] of unknownTags) {
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : '');
    warnings.push(`_${tag} is not a Figlo tag, kept in the name (${shown})`);
  }

  return {
    v: FF_IR_VERSION,
    source: { file: figma.fileKey || null, node: rootNode.id, name: rootNode.name },
    design: { w: rb.width, h: rb.height },
    screen: FF_SCREEN,
    root: rootIr,
    images: Object.fromEntries(images),
    fonts: [...fontsUsed],
    warnings,
  };
}

if (typeof module !== 'undefined') module.exports = { extract, parseName, linearGradient, imageSizeFromBytes, KNOWN_TAGS, EFFECTS };
