import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { demoFrame, node } from "../fixtures";
import { createContext, runInContext } from "node:vm";
const { catalogue } = require("./tag-guide.js");
const { KNOWN_TAGS, parseName } = require("../extract.js");

function layer(name: string, saved: any = {}) {
  let data = JSON.stringify(saved);
  return { name, getPluginData: () => data, setPluginData: (_: string, value: string) => { data = value; }, data: () => JSON.parse(data) };
}
function plugin(nodes: any[]) {
  const messages: any[] = [];
  const events: Record<string, Function> = {};
  const pageEvents: Record<string, Function> = {};
  const figma: any = { showUI() {}, on(name: string, callback: Function) { events[name] = callback; }, currentPage: { type: "PAGE", name: "Page", selection: nodes, appendChild(n: any) { n.parent = figma.currentPage; }, async loadAsync() {}, on(name: string, callback: Function) { pageEvents[name] = callback; }, off(name: string) { delete pageEvents[name]; } }, ui: { resize(w: number, h: number) { messages.push({ type: "resize", w, h }); }, postMessage(m: any) { messages.push(m); } } };
  const lookup = new Map<string, any>();
  const copies: any[] = [];
  let nextId = 0;
  function prepare(n: any) {
    lookup.set(n.id, n);
    n.exportAsync ||= async () => new Uint8Array([1, 2, 3]);
    n.remove = () => { n.removed = true; if (n.parent?.children) n.parent.children = n.parent.children.filter((c: any) => c !== n); };
    n.resize = (w: number, h: number) => { n.width = w; n.height = h; };
    n.clone = () => {
      function copy(src: any): any {
        const clone = { ...src, id: 'clone:' + ++nextId, removed: false, children: (src.children || []).map(copy) };
        for (const c of clone.children) c.parent = clone;
        prepare(clone); return clone;
      }
      const rootCopy = copy(n); copies.push(rootCopy); return rootCopy;
    };
    for (const c of n.children || []) prepare(c);
  }
  for (const n of nodes) prepare(n);
  figma.getNodeByIdAsync = async (id: string) => lookup.get(id);
  const context = createContext({ figma, __html__: "" });
  runInContext(readFileSync(new URL("../extract.js", import.meta.url), "utf8") + "\n" + readFileSync(new URL("./preview-export.js", import.meta.url), "utf8") + "\n" + readFileSync(new URL("./main.js", import.meta.url), "utf8"), context);
  return { messages, figma, events, pageEvents, copies, async preview(requestId = 1, id = nodes[0]?.id) {
    await figma.ui.onmessage({ type: "guide-preview", requestId, id });
    return messages.findLast(m => m.type === "guide-preview");
  }, async edit(type: string, nodeId: string, tag: string, params: any = {}, value = "", rootId = nodes[0]?.id) {
    await figma.ui.onmessage({ type, nodeId, rootId, tag, params, value });
    return messages.findLast(m => m.type === "guide-applied");
  }, async apply(tag: string, params: any = {}, value = "") {
    await figma.ui.onmessage({ type: "guide-apply", tag, params, value });
    return messages.findLast(m => m.type === "guide-applied");
  } };
}
describe("Tag Guide", () => {
  test("covers every recognized tag and its examples parse correctly", () => {
    expect(new Set(catalogue.map((e: any) => e.tag))).toEqual(new Set([...KNOWN_TAGS, "#"]));
    for (const entry of catalogue) {
      const parsed = parseName(entry.example);
      if (entry.tag === "#") expect(parsed.bake).toBe(true);
      else expect(parsed.tags[entry.tag]).toBeTruthy();
    }
  });
  test("adds a tag to mixed selection without toggling existing tags off", async () => {
    const a = layer("Play_smooth_pulse", { pulse: { amp: .2 }, smooth: { press: .8 } });
    const b = layer("Buy_button");
    const p = plugin([a, b]);
    expect((await p.apply("smooth", { hover: 1.2 })).error).toBeUndefined();
    expect(a.name).toBe("Play_smooth_pulse");
    expect(b.name).toBe("Buy_button_smooth");
    expect(a.data()).toEqual({ pulse: { amp: .2 }, smooth: { press: .8, hover: 1.2 } });
    expect(p.messages.findLast(m => m.type === "fx-state").tags.smooth.count).toBe(2);
  });
  test("updates navigation and state values while keeping other tags", async () => {
    const a = layer("Tab_goto:Old_smooth");
    const p = plugin([a]);
    await p.apply("goto", {}, "Details");
    expect(a.name).toBe("Tab_goto:Details_smooth");
    await p.apply("when", {}, "hover|press");
    expect(parseName(a.name).tags.when).toBe("hover|press");
    await p.apply("hide", {}, "");
    expect(parseName(a.name).tags.hide).toBe(true);
  });
  test("structural tags and the bake prefix are idempotent and reflected in selection", async () => {
    const a = layer("Art"); const p = plugin([a]);
    await p.apply("image"); await p.apply("image"); await p.apply("#"); await p.apply("#");
    expect(a.name).toBe("#Art_image");
    const state = p.messages.findLast(m => m.type === "fx-state");
    expect(state.tags.image.count).toBe(1); expect(state.tags["#"].count).toBe(1);
  });
  test("rejects invalid requests before changing any layer", async () => {
    const a = layer("Card"), b = layer("Other"); const p = plugin([a, b]);
    for (const [tag, params, value] of [
      ["unknown", {}, ""], ["pulse", { amp: 999 }, ""], ["pulse", { rate: NaN }, ""],
      ["pulse", { extra: 1 }, ""], ["goto", {}, ""], ["goto", {}, "Page_bad"],
      ["pulse", { toString: 1 }, ""],
      ["when", {}, "typo"], ["halo", { color: "bad" }, ""], ["smooth", { clickSound: "url" }, ""],
    ] as any[]) expect((await p.apply(tag, params, value)).error).toBeTruthy();
    expect(a.name).toBe("Card"); expect(b.name).toBe("Other"); expect(a.data()).toEqual({});
  });
  test("reports empty selections and stores valid color parameters", async () => {
    expect((await plugin([]).apply("pulse")).error).toBeTruthy();
    const a = layer("Badge"); await plugin([a]).apply("halo", { color: "#aabbcc", size: 8 });
    expect(a.data().halo).toEqual({ color: "AABBCC", size: 8 });
  });
  test("previews the actual selected node without changing its name or plugin data", async () => {
    let options: any;
    const a = { ...layer("Level bar", { pulse: { amp: .2 } }), id: "1:2", absoluteBoundingBox: { width: 2048, height: 128 }, async exportAsync(o: any) { options = o; return new Uint8Array([1, 2, 3]); } };
    const p = plugin([a]); const result = await p.preview(7);
    expect(result).toMatchObject({ id: "1:2", requestId: 7, name: "Level bar" });
    expect([...result.images[0].bytes]).toEqual([1, 2, 3]);
    expect(options).toEqual({ format: "PNG", useAbsoluteBounds: false, constraint: { type: "SCALE", value: .5 } });
    expect(a.name).toBe("Level bar"); expect(a.data()).toEqual({ pulse: { amp: .2 } });
    await p.figma.ui.onmessage({ type: "selection?" });
    expect(p.messages.findLast(m => m.type === "fx-state").id).toBe("1:2");
  });
  test("does not export empty, multiple or mismatched selections", async () => {
    const a = { ...layer("Art"), id: "a", exportAsync() { throw new Error("must not export"); } };
    expect(await plugin([]).preview()).toBeUndefined();
    expect(await plugin([a, a]).preview()).toBeUndefined();
    expect(await plugin([a]).preview(1, "other")).toBeUndefined();
  });
  test("drops exports that finish after the selection changes or a newer request", async () => {
    let complete: Function = () => {};
    const a = { ...layer("Art"), id: "a", absoluteBoundingBox: { width: 32, height: 32 }, exportAsync: () => new Promise(resolve => { complete = resolve; }) };
    const p = plugin([a]); const pending = p.preview(); await Promise.resolve();
    p.figma.currentPage.selection = []; p.events.selectionchange();
    complete(new Uint8Array([1])); expect(await pending).toBeUndefined();
    p.figma.currentPage.selection = [a]; const old = p.preview(2); await Promise.resolve(); const finishOld = complete;
    const latest = p.preview(3); finishOld(new Uint8Array([2])); await old;
    expect(p.messages.some(m => m.type === "guide-preview")).toBe(false);
    await Promise.resolve(); complete(new Uint8Array([3])); expect((await latest).requestId).toBe(3);
  });
  test("reports invisible artwork, failed exports and oversized snapshots", async () => {
    const a = { ...layer("Art"), id: "a", absoluteBoundingBox: { width: 0, height: 0 }, async exportAsync() { return new Uint8Array([1]); } };
    expect((await plugin([a]).preview()).error).toContain("no visible artwork");
    a.absoluteBoundingBox.width = a.absoluteBoundingBox.height = 32;
    a.exportAsync = async () => { throw new Error("Export failed"); };
    expect((await plugin([a]).preview()).error).toBe("Export failed");
    a.exportAsync = async () => new Uint8Array(16 * 1024 * 1024 + 1);
    expect((await plugin([a]).preview()).error).toContain("too large");
  });
  test("requests a refresh when the active page artwork changes", async () => {
    const a = node("FRAME", "a", "Panel", 0, 0, 100, 100); const p = plugin([a]); await p.preview();
    a.name = 'Updated panel';
    p.pageEvents.nodechange({ nodeChanges: [{ node: a }] });
    expect(p.messages.at(-1).type).toBe("guide-preview-dirty");
  });
  test("keeps child tags and stored settings in the scene without tagging the parent", async () => {
    const panel = demoFrame();
    panel.children[2].name = "Buy_button_smooth";
    panel.children[2].getPluginData = () => JSON.stringify({ smooth: { hover: 1.18 } });
    const result = await plugin([panel]).preview();
    expect(result.error).toBeUndefined();
    expect(result.ir.root.tags).toBeUndefined();
    const button = result.ir.root.children.find((n: any) => n.id === "demo:button");
    expect(button.tags).toMatchObject({ button: true, smooth: true });
    expect(button.fx.smooth.hover).toBe(1.18);
    expect(result.ir.root.children[1].children[0].tags.pulse).toBe(true);
    expect(result.ir.root.children[0].textImage).toBeTruthy();
    expect(panel.name).toBe("Figlo Demo");
    expect(panel.children[2].name).toBe("Buy_button_smooth");
    expect(panel.children).toHaveLength(3);
  });
  test("lists original descendants for editing, including ignored and baked children", async () => {
    const panel = demoFrame();
    panel.children[1].name = '#Card';
    panel.children[0].name = 'Title_ignore';
    const result = await plugin([panel]).preview();
    expect(result.error).toBeUndefined();
    expect(result.layers).toHaveLength(6);
    expect(result.layers.find((n: any) => n.id === 'demo:dot')).toMatchObject({ name: 'Dot_pulse', depth: 2, tags: { pulse: true } });
    expect(result.layers.find((n: any) => n.id === 'demo:title').tags.ignore).toBe(true);
    expect(result.layers.find((n: any) => n.id === 'demo:card').tags['#']).toBe(true);
    expect(result.layers.every((n: any) => !n.id.startsWith('clone:'))).toBe(true);
  });
  test("saves only the chosen child while the canvas selection stays on the panel", async () => {
    const panel = demoFrame(), child = panel.children[1].children[0], sibling = panel.children[2];
    Object.assign(child, layer('Dot_pulse_sway', { pulse: { amp: .2 }, sway: { angle: 8 } }));
    Object.assign(sibling, layer('Continue_pulse', { pulse: { amp: .15 } }));
    const p = plugin([panel]);
    expect((await p.edit('guide-apply', child.id, 'pulse', { amp: .3 })).count).toBe(1);
    expect(child.data()).toEqual({ pulse: { amp: .3 }, sway: { angle: 8 } });
    expect(sibling.data()).toEqual({ pulse: { amp: .15 } });
    expect(panel.name).toBe('Figlo Demo');
    expect(p.figma.currentPage.selection).toEqual([panel]);
    expect((await p.edit('guide-apply', child.id, 'when', {}, 'hover|press')).error).toBeUndefined();
    expect(parseName(child.name).tags.when).toBe('hover|press');
    expect((await p.edit('guide-remove', child.id, 'pulse')).error).toBeUndefined();
    expect(parseName(child.name).tags.pulse).toBeUndefined();
    expect(child.data()).toEqual({ sway: { angle: 8 } });
    expect(sibling.name).toBe('Continue_pulse');
  });
  test("rejects child edits after selection changes or the child leaves the panel", async () => {
    const panel = demoFrame(), child = panel.children[1].children[0], p = plugin([panel]);
    const original = child.name;
    expect((await p.edit('guide-apply', 'outside', 'smooth')).error).toContain('no longer');
    expect((await p.edit('guide-remove', child.id, 'pulse', {}, '', 'wrong-panel')).error).toContain('changed');
    expect((await p.edit('guide-apply', child.id, 'pulse', { amp: 999 })).error).toBeTruthy();
    p.figma.currentPage.selection = [panel.children[2]];
    expect((await p.edit('guide-apply', child.id, 'smooth')).error).toContain('changed');
    p.figma.currentPage.selection = [panel]; child.removed = true;
    expect((await p.edit('guide-remove', child.id, 'pulse')).error).toContain('no longer');
    expect(child.name).toBe(original);
    expect(panel.name).toBe('Figlo Demo');
  });
  test("adds and removes baking prefixes on a child without touching its parent", async () => {
    const panel = demoFrame(), child = panel.children[1], p = plugin([panel]);
    await p.edit('guide-apply', child.id, '#'); expect(child.name).toBe('#Card_frame');
    await p.edit('guide-remove', child.id, '#'); expect(child.name).toBe('Card_frame');
    expect(panel.name).toBe('Figlo Demo');
  });
  test("preserves gradient paints and exports text ink outside its layout box", async () => {
    const panel = demoFrame(), title = panel.children[0];
    panel.children[1].fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [1, 0, 0]], opacity: .8,
      gradientStops: [{ position: 0, color: { r: .3, g: .3, b: .3, a: 1 } }, { position: 1, color: { r: .1, g: .1, b: .1, a: .5 } }] }];
    title.absoluteRenderBounds = { x: 36, y: 34, width: 572, height: 66 };
    let options: any;
    title.exportAsync = async (o: any) => { options = o; return new Uint8Array([1, 2, 3]); };
    const p = plugin([panel]), result = await p.preview();
    expect(result.error).toBeUndefined();
    expect(result.ir.root.children[1].fill).toEqual({ grad: { rot: 90, keys: [[0, .3, .3, .3, .8], [1, .1, .1, .1, .4]] } });
    const previewTitle = result.ir.root.children[0];
    expect(previewTitle.pw).toBe(560); expect(previewTitle.ph).toBe(52);
    expect(previewTitle.textImageBox).toEqual({ x: .50357, y: .51923, w: 1.02143, h: 1.26923, rot: 0 });
    expect(options.useAbsoluteBounds).toBe(false);
    expect(options.constraint.value).toBeCloseTo(1024 / 572);
    expect(title.absoluteRenderBounds).toEqual({ x: 36, y: 34, width: 572, height: 66 });
    expect(p.copies.every(n => n.removed)).toBe(true);
  });
  test("positions rotated text PNGs in page axes without rotating them twice", async () => {
    const panel = demoFrame(), title = panel.children[0];
    title.width = 100; title.height = 20;
    title.rotation = -90; title.absoluteTransform = [[0, -1, 100], [1, 0, 40]];
    title.absoluteBoundingBox = { x: 80, y: 40, width: 20, height: 100 };
    title.absoluteRenderBounds = { x: 76, y: 38, width: 28, height: 106 };
    const result = await plugin([panel]).preview();
    expect(result.error).toBeUndefined();
    const previewTitle = result.ir.root.children[0];
    expect(previewTitle.rot).toBe(90);
    expect(previewTitle.textImageBox).toEqual({ x: .51, y: .5, w: .28, h: 5.3, rot: -90 });
  });
  test("removes temporary copies after successful and failed asset exports", async () => {
    const a = demoFrame(); const p = plugin([a]);
    expect((await p.preview()).error).toBeUndefined();
    expect(p.copies.every(n => n.removed)).toBe(true);
    a.children[0].exportAsync = async () => { throw new Error("Text export failed"); };
    const failed = plugin([a]);
    expect((await failed.preview()).error).toBe("Text export failed");
    expect(failed.copies.every(n => n.removed)).toBe(true);
    expect(a.removed).not.toBe(true); expect(a.children[0].name).toBe("Title_txt");
  });
  test("cancels a pending export when the preview is hidden", async () => {
    let complete: Function = () => {};
    const a = { ...layer("Art"), id: "a", absoluteBoundingBox: { width: 32, height: 32 }, exportAsync: () => new Promise(resolve => { complete = resolve; }) };
    const p = plugin([a]); const pending = p.preview(); await Promise.resolve();
    await p.figma.ui.onmessage({ type: "guide-preview-cancel" });
    complete(new Uint8Array([1])); expect(await pending).toBeUndefined();
  });
  test("ignores temporary exports and unrelated page changes", async () => {
    const a = demoFrame(); const p = plugin([a]); await p.preview();
    const before = p.messages.length;
    p.pageEvents.nodechange({ nodeChanges: [{ node: { id: "temporary", removed: true } }] });
    expect(p.messages.length).toBe(before);
    a.children[1].children[0].name = 'Updated dot_pulse';
    p.pageEvents.nodechange({ nodeChanges: [{ node: a.children[1].children[0] }] });
    expect(p.messages.at(-1).type).toBe("guide-preview-dirty");
  });
  test("does not refresh for a temporary layout reflow that has already settled", async () => {
    const a = demoFrame(); const p = plugin([a]); await p.preview();
    const before = p.messages.length, width = a.absoluteBoundingBox.width;
    a.absoluteBoundingBox.width /= 2; a.absoluteBoundingBox.width = width;
    p.pageEvents.nodechange({ nodeChanges: [{ node: a }] });
    expect(p.messages.length).toBe(before);
    a.absoluteBoundingBox.width += 20;
    p.pageEvents.nodechange({ nodeChanges: [{ node: a }] });
    expect(p.messages.at(-1).type).toBe("guide-preview-dirty");
  });
  test("bounds expanded window sizes and restores the guide dimensions", async () => {
    const p = plugin([]);
    await p.figma.ui.onmessage({ type: "guide-resize", expanded: true, width: 9999, height: 9999 });
    expect(p.messages.at(-1)).toEqual({ type: "resize", w: 1120, h: 820 });
    await p.figma.ui.onmessage({ type: "guide-resize", expanded: false });
    expect(p.messages.at(-1)).toEqual({ type: "resize", w: 400, h: 680 });
  });
});
