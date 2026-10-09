// Preview uses the import tree, exported from a temporary copy. Only that copy
// is edited for asset export; it is removed in finally, even on failure.
async function buildGuideScene(source, isCurrent) {
  const originals = new Map();
  const layers = [];
  let count = 0;
  function countNodes(node, depth = 0) {
    if (++count > 600 || depth > 40) throw new Error('Select a smaller panel to preview (up to 600 layers).');
    const meta = parseName(node.name);
    const tags = { ...meta.tags };
    if (node.name.startsWith('#')) tags['#'] = true;
    layers.push({ id: node.id, name: node.name, type: node.type, depth, tags, fx: effectParams(node, meta.tags) || {}, hidden: node.visible === false });
    for (const child of node.children || []) countNodes(child, depth + 1);
  }
  countNodes(source);
  const bounds = source.absoluteBoundingBox;
  if (!bounds || !(bounds.width > 0 && bounds.height > 0)) throw new Error('This layer has no visible artwork.');
  let copy = null;
  const images = [];
  let totalBytes = 0;
  const check = () => { if (!isCurrent()) throw new Error('Preview superseded.'); };
  function addImage(key, bytes) {
    totalBytes += bytes.length;
    if (!bytes.length || totalBytes > 16 * 1024 * 1024) throw new Error('This preview is too large. Try a smaller panel.');
    images.push({ key, bytes });
  }
  try {
    check();
    if (!CONTAINERS.has(source.type)) {
      const meta = parseName(source.name);
      const artwork = source.absoluteRenderBounds || bounds;
      const bytes = await source.exportAsync({ format: 'PNG', useAbsoluteBounds: false, constraint: { type: 'SCALE', value: Math.min(2, 1024 / Math.max(artwork.width, artwork.height)) } });
      check(); addImage(source.id, bytes);
      return { ir: { design: { w: artwork.width, h: artwork.height }, root: { id: source.id, name: meta.name, kind: 'image', image: source.id, x: .5, y: .5, w: 1, h: 1, pw: artwork.width, ph: artwork.height, tags: meta.tags, fx: effectParams(source, meta.tags) }, warnings: [] }, images, layers };
    }
    const transform = source.absoluteTransform;
    const width = source.width, height = source.height;
    copy = source.clone();
    figma.currentPage.appendChild(copy);
    copy.relativeTransform = transform;
    if (Math.abs(copy.width - width) > .01 || Math.abs(copy.height - height) > .01) copy.resize(width, height);
    // Keep the temporary copy outside the canvas area being worked on.
    copy.x -= 100000;
    function mapIds(original, cloned) {
      originals.set(cloned.id, original.id);
      for (let i = 0; i < (original.children || []).length; i++) mapIds(original.children[i], cloned.children[i]);
    }
    mapIds(source, copy);
    const ir = extract(copy);
    for (const [key, info] of Object.entries(ir.images)) {
      check(); const out = await imageBytes(key, info); addImage(key, out.bytes);
    }
    // PNG text preserves the Figma font even when it is absent on this computer.
    // Text metadata stays in the tree for _txt and other text effects.
    async function textImages(node) {
      if (node.kind === 'text') {
        check(); const text = await figma.getNodeByIdAsync(node.id);
        await withoutFoldAsync(text, async () => {
          const origin = { x: 0, y: 0 };
          const ink = renderBox(text, origin);
          if (!(ink.w > 0 && ink.h > 0)) return;
          const bytes = await text.exportAsync({ format: 'PNG', useAbsoluteBounds: false, constraint: { type: 'SCALE', value: Math.min(2, 1024 / Math.max(ink.w, ink.h)) } });
          // Keep the layout box for interaction/effects. Position the full ink
          // separately so outlines, descenders and shadows are not squeezed
          // into it. PNGs are axis-aligned, including for rotated text.
          node.textImageBox = relative(ink, nodeBox(text, origin));
          node.textImage = 'preview-text:' + node.id; addImage(node.textImage, bytes);
          // PNG already contains the text layer's own opacity.
          delete node.opacity;
        });
      }
      for (const child of node.children || []) await textImages(child);
    }
    await textImages(ir.root); check();
    function remap(node) {
      const match = /^(.*?)(:(?:shadow|bg|clip))?$/.exec(node.id);
      node.id = (originals.get(match[1]) || match[1]) + (match[2] || '');
      for (const child of node.children || []) remap(child);
    }
    remap(ir.root);
    ir.source = { node: source.id, name: source.name };
    return { ir, images, layers };
  } finally {
    if (copy && !copy.removed) copy.remove();
  }
}
