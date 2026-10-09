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
  let visible = false, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, raf = 0, last = 0, time = 0;
  let hover = false, press = false, point = { x: 0, y: 0 }, stateOverride = '', sample = null, art = null, band = null, stateText = null;
  let clickTime = -100, enterTime = -100, ripple = null, imported = false, items = 3, textValue = '12,500', width = 160, fadeValue = 1;
  let navigationVisible = false, navigationPage = 'Home';
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
    if (!matches.length) { stop(); return; }
    if (!matches.some(e => e.tag === selected)) choose(matches[0].tag);
    for (const entry of matches) {
      const button = make('button', '', entry.tag === '#' ? '# prefix' : '_' + entry.tag);
      button.setAttribute('aria-pressed', String(entry.tag === selected));
      button.onclick = () => { choose(entry.tag); list(); };
      el('guideList').append(button);
    }
    start();
  }

  function example() {
    const entry = catalogue.find(e => e.tag === selected);
    const value = el('guideValue').value.trim();
    el('guideExample').textContent = spec[selected]?.value ? entry.example.split('_')[0] + '_' + selected + (value ? ':' + value : '') : entry.example;
  }
  function params() {
    el('guideParams').replaceChildren();
    const definitions = spec[selected]?.params || {};
    el('guideSettings').hidden = !Object.keys(definitions).length;
    for (const [key, p] of Object.entries(definitions)) {
      const row = make('div', 'param'), label = make('label', '', p.label), input = make('input');
      input.id = 'guide-param-' + key; label.htmlFor = input.id;
      input.type = p.type === 'text' ? 'text' : 'range'; input.value = values[key];
      row.append(label, input);
      if (p.type !== 'text') {
        input.min = p.min; input.max = p.max; input.step = p.step;
        input.value = values[key];
        const output = make('output', '', values[key]); output.htmlFor = input.id; row.append(output);
        input.oninput = () => { values[key] = Number(input.value); output.value = input.value; draw(); };
      } else {
        input.oninput = () => { values[key] = input.value; draw(); };
        if (/Sound$/.test(key)) {
          input.title = 'Saved when applied. Audio is not played in this preview.';
          row.append(make('small', '', 'Audio plays in Roblox, not in this preview.'));
        }
      }
      el('guideParams').append(row);
    }
  }

  function choose(tag) {
    stop(); selected = tag; time = 0; hover = press = false; stateOverride = ''; point = { x: 0, y: 0 };
    imported = false; items = 3; textValue = '12,500'; width = 160; fadeValue = 1; navigationVisible = tag === 'hide'; navigationPage = 'Home'; clickTime = enterTime = -100;
    const entry = catalogue.find(e => e.tag === tag);
    values = Object.fromEntries(Object.entries(spec[tag]?.params || {}).map(([k, p]) => [k, p.def]));
    el('guideTitle').textContent = tag === '#' ? '# prefix' : '_' + tag;
    el('guideGroup').textContent = entry.category;
    el('guideDescription').textContent = description(entry);
    el('guidePlacement').textContent = entry.placement;
    el('guideValueRow').hidden = !spec[tag]?.value;
    el('guideValueLabel').textContent = spec[tag]?.value || '';
    el('guideValue').value = valueDefaults[tag] ?? '';
    example(); params(); scene(); tryControls(); updateSelection(); draw(); start();
  }

  function buttonState() { return stateOverride || (press ? 'press' : hover ? 'hover' : 'rest'); }
  function bindPointer(target) {
    target.onpointerenter = () => { hover = true; enterTime = time; draw(); };
    target.onpointerleave = () => { hover = press = false; point = { x: 0, y: 0 }; draw(); };
    target.onpointermove = e => { const r = target.getBoundingClientRect(); point = { x: (e.clientX - r.left) / r.width - .5, y: (e.clientY - r.top) / r.height - .5 }; draw(); };
    target.onpointerdown = e => { press = true; pointFromClick(e); draw(); };
    target.onpointerup = target.onpointercancel = () => { press = false; draw(); };
    target.onfocus = () => { hover = true; enterTime = time; draw(); };
    target.onblur = () => { hover = press = false; draw(); };
    target.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { press = true; draw(); } };
    target.onkeyup = () => { press = false; draw(); };
    target.onclick = e => { if (e.detail === 0) pointFromClick(); clicked(); };
  }
  function pointFromClick(e) {
    clickTime = time;
    if (ripple) ripple.remove();
    if (selected !== 'splash') return;
    const r = sample.getBoundingClientRect(); ripple = make('span', 'guide-ripple');
    ripple.style.left = (e ? e.clientX - r.left : r.width / 2) + 'px'; ripple.style.top = (e ? e.clientY - r.top : r.height / 2) + 'px'; sample.append(ripple);
  }
  function clicked() {
    if (stateOverride === 'locked') return;
    if (selected === 'goto') navigationPage = navigationPage === 'Home' ? el('guideValue').value.trim() || 'Details' : 'Home';
    if (selected === 'show') navigationVisible = true;
    if (selected === 'hide') navigationVisible = false;
    if (selected === 'switch') navigationVisible = !navigationVisible;
    if (groups.Navigation.includes(selected)) scene();
    draw();
  }

  function scene() {
    const stage = el('guideStage'); stage.replaceChildren(); sample = art = band = stateText = ripple = null;
    if (selected === 'scroll') {
      const scroll = make('div', 'guide-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Scrollable inventory preview');
      for (let i = 1; i <= 6; i++) scroll.append(make('div', 'guide-item', 'Item ' + i));
      stage.append(scroll); return;
    }
    if (['stack', 'tiles', 'stagger', 'group'].includes(selected)) {
      const panel = make('div', 'guide-panel'); sample = panel;
      const list = make('div', 'guide-items');
      list.style.flexDirection = selected === 'stack' ? 'column' : 'row';
      if (selected === 'tiles') { list.style.display = 'grid'; list.style.gridTemplateColumns = 'repeat(3, 1fr)'; }
      for (let i = 1; i <= items; i++) list.append(make('div', 'guide-item', i));
      panel.append(list); stage.append(panel); return;
    }
    if (groups.Navigation.includes(selected)) {
      const panel = make('div', 'guide-panel');
      const targetName = el('guideValue').value.trim() || 'Details';
      panel.append(make('h3', '', selected === 'goto' ? navigationPage : targetName));
      const target = make('div', 'guide-item', 'Target content');
      target.hidden = selected !== 'goto' && !navigationVisible; panel.append(target);
      sample = make('button', '', selected === 'goto' ? 'Go to ' + (navigationPage === 'Home' ? targetName : 'Home') : selected === 'hide' ? 'Close' : selected === 'show' ? 'Show details' : 'Toggle details');
      bindPointer(sample); panel.append(sample); stage.append(panel);
      if (selected === 'hide' && !el('guideValue').value.trim() && !navigationVisible) {
        panel.hidden = true;
        stage.append(make('span', 'guide-state', 'ScreenGui closed. Replay to open it.'));
      }
      return;
    }
    sample = make('button', 'guide-sample');
    if (['spin', 'rays', 'blink'].includes(selected)) sample.classList.add('guide-star');
    art = make('span', 'guide-art');
    const label = make('span', 'guide-label', selected === 'gleam' ? 'LEVEL UP' : selected === 'txt' ? textValue : selected === 'when' ? 'Hover me' : 'Try me');
    if (sample.classList.contains('guide-star')) { art = null; } else sample.append(art, label);
    if (['sheen', 'shiny', 'gleam'].includes(selected)) { band = make('span', 'guide-band'); sample.append(band); }
    if (selected === 'gleam') { sample.style.background = 'transparent'; sample.style.color = '#74ead5'; sample.style.fontSize = '24px'; sample.style.boxShadow = 'none'; }
    if (selected === 'splash') sample.style.overflow = 'hidden';
    if (selected === 'txt') sample.classList.add('guide-text-sample');
    if (selected === 'nodim') sample.append(make('span', 'guide-nodim', '★'));
    if (selected === 'when') { const badge = make('span', 'guide-nodim', '★'); badge.id = 'guideWhenBadge'; sample.append(badge); }
    if (['image', 'img', 'lock', '#', 'frame', 'keep', 'ignore', 'native'].includes(selected)) {
      sample.append(make('span', 'guide-nodim', '✦'));
      stage.append(make('span', 'guide-import-label', imported ? selected === 'ignore' ? 'Left out of the import' : ['image', 'img', 'lock', '#'].includes(selected) ? 'One ImageLabel' : selected === 'native' ? 'Original image pixels kept' : 'Editable children kept' : 'Figma: frame + text + artwork'));
      if (selected === 'ignore' && imported) sample.hidden = true;
    }
    if (selected === 'drift') { sample.style.background = 'repeating-linear-gradient(45deg, #74ead5 0 12px, #449da9 12px 24px)'; if (art) art.style.background = 'inherit'; }
    if (selected === 'tide') { sample.style.background = 'linear-gradient(90deg, #74ead5, #966bed, #74ead5)'; sample.style.backgroundSize = '200% 200%'; if (art) art.style.background = 'transparent'; }
    bindPointer(sample); stage.append(sample);
    if (['button', 'smooth', 'when', 'nodim', ...groups.Pointer].includes(selected)) { stateText = make('div', 'guide-state', 'rest'); stage.append(stateText); }
  }

  function tryControls() {
    el('guideTryControls').replaceChildren();
    const row = (title, input) => { const wrap = make('div', 'guide-try'); const label = make('label', '', title); input.id = 'guide-try-input'; label.htmlFor = input.id; wrap.append(label, input); el('guideTryControls').append(wrap); };
    if (['when', 'button', 'smooth', 'nodim'].includes(selected)) {
      const input = make('select'); for (const name of ['Pointer', 'rest', 'hover', 'press', 'locked', 'active']) { const o = make('option', '', name); o.value = name === 'Pointer' ? '' : name; input.append(o); }
      input.onchange = () => { stateOverride = input.value; draw(); }; row('Button state', input);
    } else if (selected === 'txt') {
      const input = make('input'); input.value = textValue; input.maxLength = 80;
      input.oninput = () => { textValue = input.value; sample.querySelector('.guide-label').textContent = textValue; draw(); }; row('Text', input);
    } else if (selected === 'ratio' || selected === 'group') {
      const input = make('input'); input.type = 'range'; input.min = selected === 'ratio' ? 90 : 0; input.max = selected === 'ratio' ? 230 : 1; input.step = selected === 'ratio' ? 1 : .05; input.value = selected === 'ratio' ? width : fadeValue;
      input.oninput = () => { if (selected === 'ratio') width = Number(input.value); else fadeValue = Number(input.value); draw(); }; row(selected === 'ratio' ? 'Preview width' : 'Opacity', input);
    } else if (selected === 'stack' || selected === 'tiles') {
      const button = make('button', 'guide-secondary', 'Add item'); button.onclick = () => { if (items < 6) items++; scene(); draw(); button.disabled = items >= 6; }; el('guideTryControls').append(button);
    }
    const category = catalogue.find(e => e.tag === selected).category;
    el('guideInstruction').textContent = selected === 'scroll' ? 'Scroll or drag the list' : category === 'Navigation' ? 'Click the button' : ['button', 'smooth', 'when', 'nodim', ...groups.Pointer].includes(selected) ? 'Hover, move, or press' : category === 'Structure' ? 'Try the imported view' : category === 'Entrance' ? 'Replay the entrance' : 'Change settings below';
    el('guideReplay').textContent = category === 'Structure' && !['txt', 'ratio', 'scroll', 'stack', 'tiles', 'group'].includes(selected) ? 'Compare import' : 'Replay';
    el('guidePause').hidden = !needsClock();
    pauseLabel();
  }

  function draw() {
    if (!sample || !visible || el('guideDetail').hidden) return;
    const v = values, t = time, state = buttonState(), hovered = ['hover', 'press'].includes(state), pressed = state === 'press';
    let x = 0, y = 0, angle = 0, sx = 1, sy = 1, opacity = 1;
    const sine = Math.sin(t * Math.PI * 2 * (v.rate || 1));
    if (['button', 'smooth', 'nodim'].includes(selected) && art) art.style.filter = 'brightness(' + (pressed ? v.pressDim ?? .62 : hovered ? v.hoverDim ?? .8 : 1) + ')';
    if (selected === 'smooth') { sx = sy = pressed ? v.press : hovered ? v.hover : 1; sample.style.transition = 'transform ' + v.time + 's ease-out'; }
    if (selected === 'spin') angle = t * v.speed;
    if (selected === 'rays') { angle = t * v.speed; sx = sy = 1 + sine * v.amp; }
    if (selected === 'pulse') sx = sy = 1 + sine * v.amp;
    if (selected === 'float') y = sine * v.amp * sample.offsetHeight;
    if (selected === 'sway') angle = sine * v.angle;
    if (selected === 'wobble') { sx = 1 + sine * v.amp; sy = 1 - sine * v.amp; }
    if (selected === 'blink') { const beat = Math.pow((1 + sine) / 2, 4); sx = sy = v.min + (1 - v.min) * beat; opacity = 1 - v.fade * (1 - beat); }
    if (selected === 'wiggle' || selected === 'jitter') {
      const phase = t % v.every, decay = phase < v.time ? 1 - phase / v.time : 0;
      if (selected === 'wiggle') angle = Math.sin(phase * 48) * v.angle * decay;
      else { x = Math.sin(phase * 97) * v.amount * sample.offsetHeight * decay; y = Math.cos(phase * 71) * v.amount * sample.offsetHeight * decay; }
    }
    if (selected === 'halo') { const k = v.low + (v.high - v.low) * (sine + 1) / 2; const color = /^#?[0-9a-f]{6}$/i.test(v.color) ? '#' + v.color.replace('#', '') : '#ffffff'; sample.style.boxShadow = '0 0 ' + v.size * 2 + 'px ' + v.size / 2 + 'px ' + color + Math.round(k * 255).toString(16).padStart(2, '0'); }
    if (selected === 'tide') { sample.style.backgroundImage = 'linear-gradient(' + (90 + t * v.turn) + 'deg, #74ead5, #966bed, #74ead5)'; sample.style.backgroundPosition = (50 + sine * v.amp * 100) + '% 50%'; }
    if (selected === 'drift') { const a = v.angle * Math.PI / 180; sample.style.backgroundPosition = t * v.speed * Math.sin(a) + 'px ' + (-t * v.speed * Math.cos(a)) + 'px'; }
    if (selected === 'lift' && hovered) y = -v.amount * sample.offsetHeight;
    if (selected === 'tip' && hovered) angle = point.x * v.angle * 2;
    if (selected === 'pull' && hovered) { x = point.x * v.strength * sample.offsetWidth; y = point.y * v.strength * sample.offsetHeight; }
    if (groups.Pointer.includes(selected) && selected !== 'splash' && selected !== 'sheen') sample.style.transition = 'transform ' + v.time + 's ease-out';
    if (band) {
      const elapsed = selected === 'sheen' ? t - enterTime : t % (v.time + (v.cooldown || 0));
      const progress = elapsed / v.time;
      sample.style.setProperty('--band-x', progress >= 0 && progress <= 1 ? (-500 + progress * 1100) + '%' : '-500%');
      sample.style.setProperty('--band-width', v.width * 100 + '%'); sample.style.setProperty('--band-opacity', v.opacity ?? .9); sample.style.setProperty('--band-angle', (v.angle || 0) + 'deg');
      if (selected === 'gleam') {
        band.style.display = 'none';
        const label = sample.querySelector('.guide-label');
        label.style.backgroundImage = 'linear-gradient(90deg, #74ead5 ' + (50 - v.width * 50) + '%, #fff 50%, #74ead5 ' + (50 + v.width * 50) + '%)';
        label.style.backgroundSize = '300% 100%'; label.style.backgroundPosition = (progress < 1 ? 150 - progress * 200 : 150) + '% 50%';
        label.style.backgroundClip = 'text'; label.style.color = 'transparent';
      }
    }
    if (ripple) { const p = Math.min(1, (t - clickTime) / v.time); ripple.style.transform = 'scale(' + (1 + p * 24) + ')'; ripple.style.opacity = v.opacity * (1 - p); ripple.style.background = /^#?[0-9a-f]{6}$/i.test(v.color) ? '#' + v.color.replace('#', '') : '#ffffff'; }
    const entrance = Math.min(1, t / (v.time || .3)), eased = 1 - Math.pow(1 - entrance, 3);
    if (selected === 'pop') sx = sy = v.from + (1 - v.from) * (eased + Math.sin(entrance * Math.PI) * .15);
    if (selected === 'fade') opacity = eased;
    if (selected === 'slide') { const a = v.angle * Math.PI / 180, d = v.distance * el('guideStage').offsetHeight * (1 - eased); x = Math.sin(a) * d; y = -Math.cos(a) * d; }
    if (selected === 'stagger') sample.querySelectorAll('.guide-item').forEach((child, i) => { const p = Math.max(0, Math.min(1, (t - i * v.gap) / v.time)); child.style.transform = 'scale(' + (v.from + (1 - v.from) * (1 - Math.pow(1 - p, 3))) + ')'; child.style.opacity = p > 0 ? 1 : 0; });
    if (selected === 'when') { const show = el('guideValue').value.split('|').includes(state); sample.querySelector('#guideWhenBadge').hidden = !show; }
    if (selected === 'txt') { const label = sample.querySelector('.guide-label'); label.style.fontSize = '28px'; if (label.scrollWidth > 170) label.style.fontSize = Math.max(5, 28 * 170 / label.scrollWidth) + 'px'; }
    if (selected === 'ratio') { sample.style.minHeight = '0'; sample.style.width = width + 'px'; sample.style.height = width * .5 + 'px'; }
    if (selected === 'group') opacity = fadeValue;
    sample.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + angle + 'deg) scale(' + sx + ',' + sy + ')'; sample.style.opacity = opacity;
    if (stateText) stateText.textContent = state;
  }

  function tick(now) { raf = 0; if (!visible || !playing || document.hidden || el('guideDetail').hidden) return; if (last) time += Math.min(.05, (now - last) / 1000); last = now; draw(); raf = requestAnimationFrame(tick); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
  function needsClock() { return ['Motion', 'Light', 'Entrance'].includes(catalogue.find(e => e.tag === selected).category) || ['sheen', 'splash'].includes(selected); }
  function start() { if (visible && playing && needsClock() && !document.hidden && !el('guideDetail').hidden && !raf) raf = requestAnimationFrame(tick); }
  function pauseLabel() { el('guidePause').textContent = playing ? 'Pause' : 'Play'; el('guidePause').setAttribute('aria-pressed', String(!playing)); }
  function updateSelection() {
    const has = selection.tags[selected]?.count === selection.count && selection.count > 0;
    el('guideApply').disabled = !selection.count || !Object.keys(spec).length;
    el('guideApply').textContent = (has ? 'Update' : 'Add to') + (selection.count > 1 ? ' ' + selection.count + ' selected layers' : ' selected layer');
    el('guideSelection').className = '';
    el('guideSelection').textContent = !selection.count ? 'Select a layer to add this tag.' : selection.count === 1 ? selection.name : selection.count + ' layers selected';
  }
  el('guideSearch').oninput = list; el('guideCategory').onchange = list;
  el('guideValue').oninput = () => { example(); if (groups.Navigation.includes(selected)) { navigationPage = 'Home'; scene(); } draw(); };
  el('guidePause').onclick = () => { playing = !playing; pauseLabel(); stop(); start(); };
  el('guideReplay').onclick = () => { time = 0; last = 0; enterTime = 0; clickTime = -100; imported = !imported; navigationVisible = selected === 'hide'; navigationPage = 'Home'; items = 3; if (needsClock()) playing = true; scene(); tryControls(); draw(); start(); };
  el('guideReset').onclick = () => { values = Object.fromEntries(Object.entries(spec[selected]?.params || {}).map(([k, p]) => [k, p.def])); time = 0; params(); draw(); };
  el('guideApply').onclick = () => parent.postMessage({ pluginMessage: { type: 'guide-apply', tag: selected, value: el('guideValue').value.trim(), params: { ...values } } }, '*');
  el('guideCopy').onclick = async () => {
    const value = el('guideExample').textContent;
    try { await navigator.clipboard.writeText(value); } catch { const t = make('textarea'); t.value = value; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    el('guideCopy').textContent = 'Copied'; setTimeout(() => { el('guideCopy').textContent = 'Copy'; }, 1000);
  };
  document.addEventListener('visibilitychange', () => { stop(); start(); });
  window.FigloGuide = {
    configure(definitions, tags) { spec = definitions; known = new Set(tags || Object.keys(spec)); choose(selected); list(); },
    selection(message) { selection = message; updateSelection(); },
    applied(message) { el('guideSelection').textContent = message.error || 'Applied to ' + message.count + (message.count === 1 ? ' layer.' : ' layers.'); el('guideSelection').className = message.error ? 'err' : ''; },
    setVisible(value) { visible = value; stop(); if (visible) { draw(); start(); } },
  };
})();
