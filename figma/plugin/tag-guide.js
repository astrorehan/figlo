(() => {
  // Examples cover the complete extractor vocabulary, including baking aliases.
  const groups = {
    Buttons: ['button', 'smooth', 'when', 'nodim'],
    Navigation: ['goto', 'show', 'hide', 'switch'],
    Motion: ['spin', 'rays', 'pulse', 'float', 'sway', 'wobble', 'blink', 'wiggle', 'jitter', 'halo', 'tide', 'drift'],
    Pointer: ['lift', 'tip', 'pull', 'sheen', 'splash'],
    Light: ['shiny', 'gleam'],
    Entrance: ['pop', 'fade', 'slide', 'stagger'],
    Structure: ['image', 'img', 'lock', '#', 'frame', 'keep', 'ignore', 'scroll', 'txt', 'ratio', 'group', 'stack', 'tiles', 'native'],
  };
  const notes = {
    button: ['Play_button', 'Use on a frame or image. Images inside respond to the pointer.'],
    smooth: ['Play_smooth', 'Use on a frame or image. Also makes it a button. Sounds are silent by default.'],
    when: ['Highlight_when:hover', 'Use on a child of a button. Combine states with |, for example hover|press.'],
    nodim: ['Icon_nodim', 'Use on an image inside a button. Other images still darken.'],
    goto: ['Details_goto:Details', 'The target must be a page or layer name in your imported UI.'],
    show: ['Open_show:Details', 'Use on a button. The target can be a layer, page or ScreenGui.'],
    hide: ['Close_hide', 'No target closes its own ScreenGui. Add :Details to hide another target.'],
    switch: ['Toggle_switch:Details', 'Use on a button. Clicking toggles the named target.'],
    spin: ['Star_spin', 'Use on any layer. Negative speed reverses the rotation.'],
    rays: ['Burst_rays', 'Use on a burst image. Wide images sway instead of spinning.'],
    pulse: ['Badge_pulse', 'Use on any layer. Amplitude is the change in scale.'],
    float: ['Card_float', 'Use on any layer. Height is a share of its own height.'],
    sway: ['Sign_sway', 'Use on any layer. Angle controls how far it rocks.'],
    wobble: ['Jelly_wobble', 'Use on a frame or image.'],
    blink: ['Sparkle_blink', 'Use on a sparkle or highlight.'],
    wiggle: ['Gift_wiggle', 'Use on any layer. It rests between shakes.'],
    jitter: ['Alert_jitter', 'Use on any layer. It rests between shivers.'],
    halo: ['Badge_halo', 'Text uses its text outline. Images get a box outline, not an outline of their pixels.'],
    tide: ['Background_tide', 'Use on a layer with a gradient fill.'],
    drift: ['Pattern_drift', 'Use on a tiled image fill. Direction: 0 up, 90 right.'],
    lift: ['Card_lift', 'Use on a layer or a child of a button.'],
    tip: ['Card_tip', 'Move the pointer across the preview.'],
    pull: ['Card_pull', 'Move the pointer across the preview.'],
    sheen: ['Play_sheen', 'Use on a filled shape or image, such as a button background.'],
    splash: ['Play_splash', 'Click different spots on the preview.'],
    shiny: ['Reward_shiny', 'Use on a filled shape or a shine image.'],
    gleam: ['Title_gleam', 'Use on text.'],
    pop: ['Card_pop', 'Plays when the layer becomes visible. Use Replay to try again.'],
    fade: ['Card_fade', 'Use with _group to fade all children as one.'],
    slide: ['Card_slide', 'Direction describes where it comes from: 0 above, 90 right.'],
    stagger: ['Rewards_stagger', 'Use on a container. Children enter in reading order.'],
    image: ['Artwork_image', 'Bakes the layer and all its children into one image.'],
    img: ['Artwork_img', 'Alias of _image.'],
    lock: ['Artwork_lock', 'Alias of _image. This does not lock button interactions.'],
    '#': ['#Artwork', 'A # prefix also bakes the layer and its children into one image.'],
    frame: ['Panel_frame', 'Keeps the container editable instead of flattening it.'],
    keep: ['Icons_keep', 'Keeps a vector group from being merged into one image.'],
    ignore: ['Notes_ignore', 'The layer and its children are left out of the import.'],
    scroll: ['Inventory_scroll', 'Content beyond the frame edges becomes the scroll area.'],
    txt: ['Coins_txt', 'Use on text that your game will change. Try a longer value below.'],
    ratio: ['Card_ratio', 'Keeps the width-to-height ratio from Figma.'],
    group: ['Panel_group', 'Imports as a CanvasGroup. Its children fade together. Not for buttons.'],
    stack: ['Rows_stack', 'Use on an auto-layout frame. Bake child shadows so they do not take layout cells.'],
    tiles: ['Inventory_tiles', 'Use on a wrapping auto-layout frame. The first child sets cell size.'],
    native: ['Icons_native', 'Keeps exported image pixels instead of shrinking them to the target screen size.'],
  };
  const descriptions = {
    image: 'Import the whole layer as one image.', img: 'Import the whole layer as one image.', lock: 'Import the whole layer as one image.', '#': 'Import the whole layer as one image.',
    frame: 'Keep a container and its children editable.', keep: 'Keep the children of a vector group separate.',
    ignore: 'Leave this layer out of the imported UI.', scroll: 'Turn a frame into a scrollable list.',
    nodim: 'Keep this image bright when its button is hovered or pressed.', native: 'Keep the original design pixels for image assets.',
  };
  const catalogue = Object.entries(groups).flatMap(([category, tags]) => tags.map(tag => ({ tag, category, example: notes[tag][0], placement: notes[tag][1] })));
  if (typeof module !== 'undefined') module.exports = { catalogue };
  if (typeof document === 'undefined') return;

  const el = id => document.getElementById(id);
  const make = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  let spec = {}, known = new Set(), selected = 'smooth', values = {}, selection = { count: 0, tags: {} };
  let visible = false, expanded = false, preview = null, assets = new Map(), savedScroll = 0;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previewError = '', previewTimer = 0, requestId = 0, sceneData = null;
  const valueDefaults = { when: 'hover', goto: 'Details', show: 'Details', hide: '', switch: 'Details' };
  for (const category of Object.keys(groups)) { const option = make('option', '', category); option.value = category; el('guideCategory').append(option); }

  function description(entry) { return descriptions[entry.tag] || spec[entry.tag]?.hint || 'Changes how this layer is imported.'; }
  function list() {
    const query = el('guideSearch').value.trim().toLowerCase(), category = el('guideCategory').value;
    const matches = catalogue.filter(e => (known.has(e.tag) || e.tag === '#') && (!category || e.category === category)
      && (!query || [e.tag, e.category, e.example, e.placement, description(e)].join(' ').toLowerCase().includes(query)));
    el('guideList').replaceChildren();
    el('guideEmpty').hidden = matches.length !== 0;
    el('guideDetail').hidden = matches.length === 0;
    if (!matches.length) return;
    if (!matches.some(e => e.tag === selected)) choose(matches[0].tag);
    for (const entry of matches) {
      const button = make('button', '', entry.tag === '#' ? '# prefix' : '_' + entry.tag);
      button.setAttribute('aria-pressed', String(entry.tag === selected));
      button.onclick = () => { choose(entry.tag); list(); };
      el('guideList').append(button);
    }
  }

  function example() {
    const entry = catalogue.find(e => e.tag === selected);
    const value = el('guideValue').value.trim();
    const parts = selection.count === 1 ? selection.name.split('_') : [entry.example.split('_')[0]];
    while (parts.length > 1 && known.has(parts.at(-1).split(':')[0].toLowerCase())) parts.pop();
    const base = parts.join('_').replace(/^#/, '');
    el('guideExample').textContent = selected === '#' ? '#' + base : base + '_' + selected + (spec[selected]?.value && value ? ':' + value : '');
  }
  function params() {
    el('guideParams').replaceChildren();
    const definitions = spec[selected]?.params || {};
    el('guideSettings').hidden = !Object.keys(definitions).length;
    for (const [key, p] of Object.entries(definitions)) {
      const row = make('div', 'param'), label = make('label', '', p.label), input = make('input');
      input.id = 'guide-param-' + key; label.htmlFor = input.id;
      input.disabled = !matchingNodes(selected).length;
      input.type = p.type === 'text' ? 'text' : 'range'; input.value = values[key];
      row.append(label, input);
      if (p.type !== 'text') {
        input.min = p.min; input.max = p.max; input.step = p.step;
        input.value = values[key];
        const output = make('output', '', values[key]); output.htmlFor = input.id; row.append(output);
        input.oninput = () => { values[key] = Number(input.value); output.value = input.value; preview?.updateTag(selected, values); };
      } else {
        input.oninput = () => { values[key] = input.value; preview?.updateTag(selected, values); };
        if (/Sound$/.test(key)) {
          input.title = 'Saved when applied. Audio is not played in this preview.';
          row.append(make('small', '', 'Audio plays in Roblox, not in this preview.'));
        }
      }
      el('guideParams').append(row);
    }
  }

  function matchingNodes(tag) {
    const out = [];
    function visit(n) { if (n.tags?.[tag]) out.push(n); for (const c of n.children || []) visit(c); }
    if (sceneData) visit(sceneData.ir.root);
    return out;
  }
  function choose(tag) {
    selected = tag;
    const entry = catalogue.find(e => e.tag === tag), first = matchingNodes(tag)[0];
    values = Object.fromEntries(Object.entries(spec[tag]?.params || {}).map(([k, p]) => [k, preview?.tagValues(tag)?.[k] ?? first?.fx?.[tag]?.[k] ?? p.def]));
    el('guideTitle').textContent = tag === '#' ? '# prefix' : '_' + tag;
    el('guideGroup').textContent = entry.category;
    el('guideDescription').textContent = description(entry);
    el('guidePlacement').textContent = entry.placement;
    el('guideValueRow').hidden = !spec[tag]?.value;
    el('guideValueLabel').textContent = spec[tag]?.value || '';
    el('guideValue').value = typeof first?.tags[tag] === 'string' ? first.tags[tag] : valueDefaults[tag] ?? '';
    example(); params(); updateSelection();
    const matches = matchingNodes(tag);
    for (const input of el('guideParams').querySelectorAll('input')) input.disabled = !matches.length;
    el('guideSettingsNote').textContent = matches.length ? 'Preview settings for ' + matches.length + (matches.length === 1 ? ' tagged layer.' : ' tagged layers.') : 'No layer in this frame has this tag yet.';
    el('guideReset').disabled = !matches.length;
  }
  function clearScene() {
    preview?.destroy(); preview = null;
    for (const asset of assets.values()) URL.revokeObjectURL(asset.url);
    assets = new Map(); sceneData = null;
  }
  function placeholder() {
    const stage = el('guideStage'); stage.replaceChildren();
    const message = previewError || (selection.count === 1 ? 'Loading selected UI…' : selection.count > 1 ? 'Select one frame to preview its UI.' : 'Select a frame to preview its UI.');
    stage.append(make('p', 'guide-placeholder', message)); stage.setAttribute('aria-busy', String(selection.count === 1 && !previewError));
    el('guideNote').textContent = 'Select a panel to interact with its tagged children.';
  }
  function refresh() {
    clearTimeout(previewTimer);
    const next = ++requestId;
    if (!visible || selection.count !== 1) return;
    previewTimer = setTimeout(() => parent.postMessage({ pluginMessage: { type: 'guide-preview', requestId: next, id: selection.id } }, '*'), 160);
  }
  function pauseLabel() { el('guidePause').textContent = playing ? 'Pause' : 'Play'; el('guidePause').setAttribute('aria-pressed', String(!playing)); }
  function maximize(value) {
    if (value) savedScroll = scrollY;
    expanded = value; document.body.classList.toggle('preview-expanded', expanded);
    el('guideMaximize').textContent = expanded ? 'Back to guide' : 'Maximize';
    el('guideMaximize').setAttribute('aria-expanded', String(expanded));
    parent.postMessage({ pluginMessage: { type: 'guide-resize', expanded, width: Math.max(400, screen.availWidth - 160), height: Math.max(480, screen.availHeight - 160) } }, '*');
    preview?.fit();
    window.scrollTo(0, value ? 0 : savedScroll);
  }

  function updateSelection() {
    const has = selection.tags[selected]?.count === selection.count && selection.count > 0;
    el('guideApply').disabled = !selection.count || !Object.keys(spec).length;
    el('guideApply').textContent = (has ? 'Update' : 'Add to') + (selection.count > 1 ? ' ' + selection.count + ' selected layers' : ' selected layer');
    el('guideSelection').className = '';
    el('guideSelection').textContent = !selection.count ? 'Select a layer to add this tag.' : selection.count === 1 ? selection.name : selection.count + ' layers selected';
  }
  el('guideSearch').oninput = list; el('guideCategory').onchange = list;
  el('guideValue').oninput = example;
  el('guidePause').onclick = () => { playing = !playing; pauseLabel(); preview?.play(playing); };
  el('guideReplay').onclick = () => { if (!preview) { refresh(); return; } preview.replay(); el('guideNote').textContent = 'Preview: ' + selection.name; };
  el('guideRefresh').onclick = refresh;
  el('guideMaximize').onclick = () => maximize(!expanded);
  document.addEventListener('keydown', e => { if (expanded && e.key === 'Escape') { e.preventDefault(); maximize(false); el('guideMaximize').focus(); } });
  el('guideReset').onclick = () => { values = Object.fromEntries(Object.entries(spec[selected]?.params || {}).map(([k, p]) => [k, p.def])); params(); preview?.updateTag(selected, values); };
  el('guideApply').onclick = () => parent.postMessage({ pluginMessage: { type: 'guide-apply', tag: selected, value: el('guideValue').value.trim(), params: { ...values } } }, '*');
  el('guideCopy').onclick = async () => {
    const value = el('guideExample').textContent;
    try { await navigator.clipboard.writeText(value); } catch { const t = make('textarea'); t.value = value; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    el('guideCopy').textContent = 'Copied'; setTimeout(() => { el('guideCopy').textContent = 'Copy'; }, 1000);
  };
  window.addEventListener('unload', () => { clearTimeout(previewTimer); clearScene(); });
  document.addEventListener('visibilitychange', () => preview?.setVisible(visible && !document.hidden));
  window.FigloGuide = {
    configure(definitions, tags) { spec = definitions; known = new Set(tags || Object.keys(spec)); choose(selected); list(); pauseLabel(); },
    selection(message) {
      const changed = message.id !== selection.id || message.count !== selection.count;
      selection = message; updateSelection(); example();
      if (changed) { clearScene(); previewError = ''; placeholder(); choose(selected); }
      refresh();
    },
    refresh,
    async preview(message) {
      const current = () => visible && message.requestId === requestId && message.id === selection.id && selection.count === 1;
      if (!current()) return;
      if (message.error) { clearScene(); previewError = message.error; placeholder(); choose(selected); return; }
      const nextAssets = new Map();
      try {
        for (const item of message.images || []) {
          const url = URL.createObjectURL(new Blob([new Uint8Array(item.bytes)], { type: 'image/png' }));
          const img = new Image(); img.src = url; nextAssets.set(item.key, { url, w: 1, h: 1 });
          await img.decode(); nextAssets.set(item.key, { url, w: img.naturalWidth, h: img.naturalHeight });
          if (!current()) break;
        }
      } catch {
        for (const a of nextAssets.values()) URL.revokeObjectURL(a.url);
        if (!current()) return;
        clearScene(); previewError = 'Could not load the preview images. Use Refresh to try again.'; placeholder(); return;
      }
      if (!current()) { for (const a of nextAssets.values()) URL.revokeObjectURL(a.url); return; }
      clearScene(); assets = nextAssets; sceneData = message; previewError = '';
      preview = window.FigloPreview.mount(el('guideStage'), message.ir, assets, spec, text => { el('guideNote').textContent = text; });
      preview.play(playing); el('guideStage').setAttribute('aria-busy', 'false');
      el('guideNote').textContent = message.ir.warnings?.length ? message.ir.warnings.join(' · ') : 'Preview: ' + message.name;
      choose(selected); el('guidePreviewTitle').textContent = message.name;
    },
    applied(message) { el('guideSelection').textContent = message.error || 'Applied to ' + message.count + (message.count === 1 ? ' layer.' : ' layers.'); el('guideSelection').className = message.error ? 'err' : ''; },
    setVisible(value) { visible = value; preview?.setVisible(value); if (visible) { if (!preview) placeholder(); refresh(); } else { clearTimeout(previewTimer); ++requestId; parent.postMessage({ pluginMessage: { type: 'guide-preview-cancel' } }, '*'); if (expanded) maximize(false); } },
  };
})();
