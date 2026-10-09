(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pointerTags = ['lift', 'tip', 'pull', 'sheen', 'splash'];
  const clockTags = new Set(['spin', 'rays', 'pulse', 'float', 'sway', 'wobble', 'blink', 'wiggle', 'jitter', 'halo', 'tide', 'drift', 'shiny', 'gleam', 'sheen', 'splash', 'pop', 'fade', 'slide', 'stagger']);
  // Effects compose on a node, as the runtime's scale/offset/rotation channels do.
  function motion(node, fx, t, state, point, age, parentSize) {
    let x = 0, y = 0, angle = node.rot || 0, sx = 1, sy = 1, opacity = node.opacity ?? 1;
    const hovered = state === 'hover' || state === 'press', pressed = state === 'press';
    for (const [tag, v] of Object.entries(fx)) {
      const wave = Math.sin(t * TAU * (v.rate || 1));
      if (tag === 'smooth') sx *= pressed ? v.press : hovered ? v.hover : 1;
      if (tag === 'spin') angle += t * v.speed;
      if (tag === 'rays') { angle += node.pw > node.ph * 2 ? Math.sin(t * .8) * 4 : t * v.speed; sx *= 1 + wave * v.amp; }
      if (tag === 'pulse') sx *= 1 + wave * v.amp;
      if (tag === 'float') y -= wave * v.amp * node.ph;
      if (tag === 'sway') angle += wave * v.angle;
      if (tag === 'wobble' && node.kind !== 'text') { sx *= 1 + wave * v.amp; sy *= 1 - wave * v.amp; }
      if (tag === 'blink') { const beat = Math.pow(.5 + .5 * Math.cos(t * TAU * v.rate), .6); sx *= v.min + (1 - v.min) * beat; if (node.kind === 'image') opacity *= 1 - v.fade * (1 - beat); }
      if (tag === 'wiggle' || tag === 'jitter') {
        const every = Math.max(.1, v.every), duration = Math.min(every, v.time), phase = t % every;
        if (phase < duration) {
          const u = phase / duration;
          if (tag === 'wiggle') angle += v.angle * Math.exp(-4 * u) * Math.sin(u * TAU * 3);
          else { x += Math.sin(phase * 97) * v.amount * node.ph * (1 - u); y += Math.cos(phase * 71) * v.amount * node.ph * (1 - u); }
        }
      }
      if (tag === 'lift' && hovered) y -= v.amount * node.ph;
      if (tag === 'tip' && hovered) angle += clamp(point.x * 2, -1, 1) * v.angle;
      if (tag === 'pull' && hovered) { x += point.x * point.w * v.strength; y += point.y * point.h * v.strength; }
      if (tag === 'pop') { const p = clamp(age / v.time, 0, 1); sx *= v.from + (1 - v.from) * (1 - Math.pow(1 - p, 3) + Math.sin(p * Math.PI) * .15); }
      if (tag === 'fade') opacity *= 1 - Math.pow(1 - clamp(age / v.time, 0, 1), 3);
      if (tag === 'slide') { const d = v.distance * Math.pow(1 - clamp(age / v.time, 0, 1), 5), a = v.angle * Math.PI / 180; x += Math.sin(a) * d * parentSize.w; y -= Math.cos(a) * d * parentSize.h; }
    }
    // Uniform channels also affect the y scale; wobble contributes independently.
    const wobble = fx.wobble && node.kind !== 'text' ? 1 + Math.sin(t * TAU * fx.wobble.rate) * fx.wobble.amp : 1;
    sy *= sx / wobble;
    return { x, y, angle, sx, sy, opacity };
  }
  if (typeof module !== 'undefined') module.exports = { motion };
  if (typeof document === 'undefined') return;
  const make = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
  const color = (c = [1, 1, 1], a = 1) => 'rgba(' + c.map(v => Math.round(clamp(v, 0, 1) * 255)).join(',') + ',' + clamp(a, 0, 1) + ')';
  function gradient(g, angle = g.rot || 0) { return 'linear-gradient(' + (angle + 90) + 'deg,' + g.keys.map(k => color(k.slice(1, 4), k[4]) + ' ' + k[0] * 100 + '%').join(',') + ')'; }

  class Preview {
    constructor(host, ir, assets, definitions, report) {
      this.host = host; this.ir = ir; this.assets = assets; this.spec = definitions; this.report = report;
      this.records = []; this.byId = new Map(); this.byName = new Map(); this.time = 0; this.last = 0; this.raf = 0;
      this.running = !matchMedia('(prefers-reduced-motion: reduce)').matches; this.visible = true; this.scale = 1;
      host.replaceChildren(); this.viewport = make('div', 'preview-viewport'); this.world = make('div', 'preview-world');
      this.world.style.width = ir.design.w + 'px'; this.world.style.height = ir.design.h + 'px';
      this.viewport.append(this.world); host.append(this.viewport);
      this.build(ir.root, this.world, null, ir.design);
      this.needsClock = this.records.some(r => Object.keys(r.fx).some(tag => clockTags.has(tag)));
      for (const parent of this.records) if (parent.fx.stagger) {
        let children = this.records.filter(r => r.parent === parent);
        if (children.length === 1 && /:clip$/.test(children[0].n.id)) children = this.records.filter(r => r.parent === children[0]);
        const bodies = children.filter(r => !/:(bg|shadow)$/.test(r.n.id)).sort((a, b) => a.n.y - b.n.y || a.n.x - b.n.x);
        for (const child of children) child.stagger = { parent, index: Math.max(0, bodies.findIndex(r => r.n.id === child.n.id.replace(/:(bg|shadow)$/, ''))) };
      }
      this.release = () => { for (const r of this.records) r.press = false; this.draw(); };
      window.addEventListener('pointerup', this.release); window.addEventListener('pointercancel', this.release);
      window.addEventListener('blur', this.release);
      this.resize = new ResizeObserver(() => this.fit()); this.resize.observe(host);
      this.fit(); this.draw(); this.start();
    }
    params(node) {
      const out = {};
      for (const tag of Object.keys(node.tags || {})) {
        const definition = this.spec[tag]; if (!definition) continue;
        out[tag] = Object.fromEntries(Object.entries(definition.params || {}).map(([key, p]) => {
          const v = node.fx?.[tag]?.[key];
          return [key, p.type === 'text' ? (typeof v === 'string' ? v : p.def) : (Number.isFinite(v) ? clamp(v, p.min, p.max) : p.def)];
        }));
      }
      return out;
    }
    build(n, holder, parent, parentSize) {
      if (n.tags?.ignore) return;
      const e = make('div', 'preview-node'); e.dataset.nodeId = n.id; e.dataset.name = n.name; e.dataset.kind = n.kind;
      const w = n.w * parentSize.w, h = n.h * parentSize.h;
      Object.assign(e.style, { left: n.x * parentSize.w + 'px', top: n.y * parentSize.h + 'px', width: w + 'px', height: h + 'px', borderRadius: (n.radius || 0) + 'px' });
      const r = { n, e, parent, parentSize, w, h, fx: this.params(n), hover: false, press: false, locked: false, active: false, point: { x: 0, y: 0, w, h }, shown: true, effective: false, start: 0, entered: -100, clicked: -100, ripples: [], bands: [] };
      this.records.push(r); this.byId.set(n.id, r); if (!this.byName.has(n.name)) this.byName.set(n.name, r);
      r.button = !!(n.button || n.tags?.button || ['smooth', 'goto', 'show', 'hide', 'switch'].some(t => n.tags?.[t]));
      if (r.button) { e.setAttribute('role', 'button'); e.setAttribute('aria-label', n.name); e.tabIndex = 0; e.dataset.button = 'true'; }
      if (r.button || pointerTags.some(t => n.tags?.[t]) || n.kind === 'scroll') e.style.pointerEvents = 'auto';
      r.paint = make('span', 'preview-paint'); r.paint.style.borderRadius = 'inherit'; e.append(r.paint);
      if (n.fill) r.paint.style.background = n.fill.g ? gradient(n.fill.g) : color(n.fill.c, n.fill.a);
      if (n.stroke) r.paint.style.boxShadow = 'inset 0 0 0 ' + n.stroke.w + 'px ' + color(n.stroke.c, n.stroke.a);
      const imageKey = n.kind === 'text' ? n.textImage : n.image;
      if (imageKey && this.assets.has(imageKey)) {
        if (n.scale === 'TILE') { r.paint.style.backgroundImage = 'url("' + this.assets.get(imageKey).url + '")'; r.paint.style.backgroundRepeat = 'repeat'; const a = this.assets.get(imageKey); r.paint.style.backgroundSize = a.w * (n.tileScale || 1) + 'px ' + a.h * (n.tileScale || 1) + 'px'; }
        else { const img = make('img', 'preview-image'); img.src = this.assets.get(imageKey).url; img.alt = n.kind === 'text' ? n.text.value : ''; img.draggable = false; img.style.objectFit = n.scale === 'FIT' ? 'contain' : n.scale === 'FILL' ? 'cover' : 'fill'; r.paint.append(img); r.image = img; }
        r.paint.style.opacity = n.imageAlpha ?? 1;
      } else if (n.kind === 'text') this.text(r, n.text.value);
      if (['clip', 'canvas'].includes(n.kind)) e.style.overflow = 'hidden';
      let childHolder = e, childSize = { w, h };
      if (n.kind === 'scroll') {
        e.style.overflow = 'auto'; e.tabIndex = 0; e.setAttribute('aria-label', n.name + ' scroll area');
        childHolder = make('div', 'preview-scroll-canvas'); childSize = { w: w * (n.canvasW || 1), h: h * (n.canvasH || 1) };
        childHolder.style.width = childSize.w + 'px'; childHolder.style.height = childSize.h + 'px'; e.append(childHolder);
        if (n.scrollDir === 'HORIZONTAL') e.style.overflowY = 'hidden'; else if (n.scrollDir === 'VERTICAL') e.style.overflowX = 'hidden';
      }
      for (const tag of ['shiny', 'gleam', 'sheen']) if (r.fx[tag] && (tag !== 'gleam' || n.kind === 'text')) {
        const band = make('span', 'preview-band'); band.style.borderRadius = 'inherit';
        if (r.image) { band.style.maskImage = 'url("' + r.image.src + '")'; band.style.maskSize = '100% 100%'; }
        r.paint.append(band); r.bands.push({ tag, e: band });
      }
      holder.append(e);
      for (const child of n.children || []) this.build(child, childHolder, r, childSize);
      this.bind(r);
      return r;
    }
    text(r, value) {
      r.paint.replaceChildren(); const label = make('span', 'preview-text'); label.textContent = value;
      const t = r.n.text;
      Object.assign(label.style, { fontFamily: t.family + ', sans-serif', fontSize: t.size + 'px', fontWeight: /bold|black|heavy/i.test(t.style) ? '700' : '400', fontStyle: /italic|oblique/i.test(t.style) ? 'italic' : 'normal', color: color(t.fill?.c, t.fill?.a), textAlign: (t.alignX || 'LEFT').toLowerCase(), lineHeight: t.lineHeight?.px ? t.lineHeight.px + 'px' : 'normal', whiteSpace: t.hardLines > 1 ? 'pre-wrap' : 'pre' });
      if (t.stroke) label.style.webkitTextStroke = t.stroke.w + 'px ' + color(t.stroke.c, t.stroke.a);
      r.paint.append(label); r.text = label; r.image = null;
      if (r.n.tags?.txt) {
        label.style.fontSize = t.size + 'px';
        if (label.scrollWidth > r.w * 1.06) label.style.fontSize = Math.max(t.size * .3, t.size * r.w * .98 / label.scrollWidth) + 'px';
      }
    }
    source(r, includeSelf = true) {
      for (let p = includeSelf ? r : r.parent; p; p = p.parent) if (p.button) return p;
      return includeSelf ? r : null;
    }
    state(r) { return r.locked ? 'locked' : r.active ? 'active' : r.press ? 'press' : r.hover ? 'hover' : 'rest'; }
    bind(r) {
      const update = () => this.draw();
      r.e.onpointerenter = e => { r.hover = true; if (!e.buttons) r.press = false; r.entered = this.time; update(); };
      r.e.onpointerleave = () => { r.hover = false; r.point.x = r.point.y = 0; update(); };
      r.e.onpointermove = e => { const box = r.e.getBoundingClientRect(); r.point = { x: clamp((e.clientX - box.left) / box.width - .5, -.5, .5), y: clamp((e.clientY - box.top) / box.height - .5, -.5, .5), w: r.w, h: r.h }; update(); };
      r.e.onpointerdown = e => {
        if (r.locked || e.button !== 0) return;
        r.press = true; r.clicked = this.time; this.splash(r, e); update();
        if (r.button) e.stopPropagation();
      };
      if (r.button) {
        r.e.onfocus = () => { r.hover = true; r.entered = this.time; update(); };
        r.e.onblur = () => { r.hover = r.press = false; update(); };
        r.e.onkeydown = e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!r.locked && !e.repeat) { r.press = true; r.clicked = this.time; this.splash(r); update(); } } };
        r.e.onkeyup = e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); r.press = false; this.activate(r); } };
        r.e.onclick = e => { e.stopPropagation(); this.activate(r); };
      }
    }
    splash(source, event) {
      for (const r of this.records) if (r.fx.splash && this.source(r) === source) {
        const holder = make('span', 'preview-splash'); holder.style.borderRadius = 'inherit';
        const dot = make('span', 'preview-ripple'), b = r.e.getBoundingClientRect();
        dot.style.left = (event ? (event.clientX - b.left) / this.scale : r.w / 2) + 'px'; dot.style.top = (event ? (event.clientY - b.top) / this.scale : r.h / 2) + 'px';
        const tint = /^#?[0-9a-f]{6}$/i.test(r.fx.splash.color) ? '#' + r.fx.splash.color.replace('#', '') : '#fff'; dot.style.background = tint;
        holder.append(dot); r.e.append(holder); r.ripples.push({ holder, dot, time: this.time });
      }
    }
    target(name) { return this.byName.get(name); }
    activate(r) {
      if (r.locked) return;
      const notices = [];
      const tags = r.n.tags || {}, lookup = (tag) => {
        const name = tags[tag], target = typeof name === 'string' && this.target(name);
        if (!target) notices.push('Target "' + name + '" is outside this preview. Select a frame containing both layers.');
        return target;
      };
      if (typeof tags.goto === 'string') {
        const target = lookup('goto');
        if (target) {
          for (const other of this.records) if (typeof other.n.tags?.goto === 'string') {
            const sibling = this.target(other.n.tags.goto);
            if (sibling && sibling !== target && sibling.parent === target.parent) sibling.shown = false;
          }
          target.shown = true;
        }
      }
      for (const tag of ['show', 'switch', 'hide']) if (tags[tag]) {
        if (tag === 'hide' && tags.hide === true) this.records[0].shown = false;
        else { const target = lookup(tag); if (target) target.shown = tag === 'show' ? true : tag === 'hide' ? false : !target.shown; }
      }
      this.report(notices.length ? notices.join(' ') : 'Clicked ' + r.n.name + '.'); this.draw();
    }
    draw() {
      for (const r of this.records) {
        const source = this.source(r), tags = r.n.tags || {};
        r.active = typeof tags.goto === 'string' && !!this.target(tags.goto)?.shown;
        const state = this.state(source);
        let shown = r.shown && (!r.parent || r.parent.effective);
        if (typeof tags.when === 'string') { const parentButton = this.source(r, false); if (parentButton) shown &&= tags.when.toLowerCase().split('|').includes(this.state(parentButton)); }
        if (shown && !r.effective) r.start = this.time;
        r.effective = shown; r.e.style.display = shown ? '' : 'none';
        r.e.setAttribute('aria-hidden', String(!shown));
        if (r.button) r.e.setAttribute('aria-disabled', String(r.locked));
        if (!shown) continue;
        const fx = motion(r.n, r.fx, this.time, state, source.point, this.time - r.start, r.parentSize);
        if (r.stagger) {
          const v = r.stagger.parent.fx.stagger, p = clamp((this.time - r.stagger.parent.start - r.stagger.index * v.gap) / v.time, 0, 1);
          const k = v.from + (1 - v.from) * (1 - Math.pow(1 - p, 3)); fx.sx *= k; fx.sy *= k;
        }
        r.e.style.transform = 'translate(-50%,-50%) translate(' + fx.x + 'px,' + fx.y + 'px) rotate(' + fx.angle + 'deg) scale(' + fx.sx + ',' + fx.sy + ')'; r.e.style.opacity = fx.opacity;
        const ease = r.fx.smooth?.time || r.fx.lift?.time || r.fx.tip?.time || r.fx.pull?.time;
        r.e.style.transition = ease ? 'transform ' + ease + 's ease-out' : '';
        const dimSource = r.n.kind === 'image' && !tags.nodim ? this.source(r) : r.button ? r : null;
        const dim = dimSource?.fx.button, dimState = dimSource && (dimSource.locked ? 'rest' : dimSource.press ? 'press' : dimSource.hover ? 'hover' : 'rest');
        r.paint.style.filter = dim ? 'brightness(' + (dimState === 'press' ? dim.pressDim : dimState === 'hover' ? dim.hoverDim : 1) + ')' : '';
        if (r.fx.halo) { const v = r.fx.halo, k = v.low + (v.high - v.low) * (.5 - .5 * Math.cos(this.time * TAU * v.rate)); const tint = /^#?[0-9a-f]{6}$/i.test(v.color) ? '#' + v.color.replace('#', '') : '#fff'; r.paint.style.filter += ' drop-shadow(0 0 ' + v.size + 'px ' + tint + Math.round(clamp(k, 0, 1) * 255).toString(16).padStart(2, '0') + ')'; }
        if (r.fx.tide && r.n.fill?.g) { const v = r.fx.tide; r.paint.style.backgroundImage = gradient(r.n.fill.g, r.n.fill.g.rot + this.time * v.turn); r.paint.style.backgroundSize = '200% 100%'; r.paint.style.backgroundPosition = (50 + Math.sin(this.time * TAU * v.rate) * v.amp * 50) + '% 50%'; }
        if (r.fx.drift && r.n.scale === 'TILE') { const v = r.fx.drift, angle = v.angle * Math.PI / 180; r.paint.style.backgroundPosition = this.time * v.speed * Math.sin(angle) + 'px ' + -this.time * v.speed * Math.cos(angle) + 'px'; }
        for (const band of r.bands) {
          const v = r.fx[band.tag], elapsed = band.tag === 'sheen' ? this.time - source.entered : this.time % (v.time + (v.cooldown || 0)), p = elapsed / v.time;
          band.e.style.display = p >= 0 && p <= 1 ? '' : 'none'; band.e.style.setProperty('--band-x', (-300 + p * 800) + '%'); band.e.style.setProperty('--band-width', v.width * 100 + '%'); band.e.style.setProperty('--band-opacity', v.opacity ?? .9); band.e.style.setProperty('--band-angle', (v.angle || 0) + 'deg');
        }
        for (const ripple of r.ripples) {
          const p = clamp((this.time - ripple.time) / r.fx.splash.time, 0, 1);
          ripple.dot.style.transform = 'scale(' + (1 + p * Math.max(r.w, r.h) / 5) + ')'; ripple.dot.style.opacity = r.fx.splash.opacity * (1 - p);
          if (p === 1) ripple.holder.remove();
        }
        r.ripples = r.ripples.filter(v => v.holder.isConnected);
      }
      // A baked background or shadow moves with its live companion.
      for (const r of this.records) if (/:(bg|shadow)$/.test(r.n.id)) {
        const body = this.byId.get(r.n.id.replace(/:(bg|shadow)$/, ''));
        if (body) { r.e.style.transform = body.e.style.transform; r.e.style.opacity = body.e.style.opacity; r.e.style.display = body.e.style.display; }
      }
    }
    fit() {
      this.scale = Math.min((this.host.clientWidth - 32) / this.ir.design.w, (this.host.clientHeight - 32) / this.ir.design.h);
      this.scale = Math.max(.01, Math.min(this.scale, 2));
      this.world.style.transform = 'scale(' + this.scale + ')'; this.viewport.style.width = this.ir.design.w * this.scale + 'px'; this.viewport.style.height = this.ir.design.h * this.scale + 'px';
    }
    start() {
      if (this.raf || !this.needsClock || !this.visible || !this.running || document.hidden) return;
      const tick = now => { this.raf = 0; if (!this.visible || !this.running || document.hidden) return; if (this.last) this.time += Math.min(.05, (now - this.last) / 1000); this.last = now; this.draw(); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; }
    setVisible(value) { this.visible = value; this.stop(); this.start(); }
    play(value) { this.running = value; this.stop(); this.start(); }
    replay() { this.time = 0; this.last = 0; for (const r of this.records) { r.shown = true; r.effective = false; r.hover = r.press = r.locked = false; r.entered = -100; r.e.scrollTop = r.e.scrollLeft = 0; for (const v of r.ripples) v.holder.remove(); r.ripples = []; } this.draw(); }
    updateTag(tag, values) { for (const r of this.records) if (r.n.tags?.[tag]) r.fx[tag] = { ...r.fx[tag], ...values }; this.draw(); }
    tagValues(tag) { return this.records.find(r => r.n.tags?.[tag])?.fx[tag]; }
    buttonState(state) { for (const r of this.records) if (r.button) { r.locked = state === 'locked'; r.hover = state === 'hover'; r.press = state === 'press'; } this.draw(); }
    destroy() { this.stop(); this.resize.disconnect(); window.removeEventListener('pointerup', this.release); window.removeEventListener('pointercancel', this.release); window.removeEventListener('blur', this.release); }
  }
  window.FigloPreview = { mount: (...args) => new Preview(...args) };
})();
