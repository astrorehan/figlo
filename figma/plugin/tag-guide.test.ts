import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
  const figma: any = { showUI() {}, on(name: string, callback: Function) { events[name] = callback; }, currentPage: { selection: nodes, async loadAsync() {}, on(name: string, callback: Function) { pageEvents[name] = callback; }, off(name: string) { delete pageEvents[name]; } }, ui: { postMessage(m: any) { messages.push(m); } } };
  const context = createContext({ figma, __html__: "" });
  runInContext(readFileSync(new URL("../extract.js", import.meta.url), "utf8") + "\n" + readFileSync(new URL("./main.js", import.meta.url), "utf8"), context);
  return { messages, figma, events, pageEvents, async preview(requestId = 1, id = nodes[0]?.id) {
    await figma.ui.onmessage({ type: "guide-preview", requestId, id });
    return messages.findLast(m => m.type === "guide-preview");
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
    const a = { ...layer("Level bar", { pulse: { amp: .2 } }), id: "1:2", absoluteRenderBounds: { width: 2048, height: 128 }, async exportAsync(o: any) { options = o; return new Uint8Array([1, 2, 3]); } };
    const p = plugin([a]); const result = await p.preview(7);
    expect(result).toMatchObject({ id: "1:2", requestId: 7, name: "Level bar" });
    expect([...result.bytes]).toEqual([1, 2, 3]);
    expect(options).toEqual({ format: "PNG", constraint: { type: "SCALE", value: .5 } });
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
    const a = { ...layer("Art"), id: "a", width: 32, height: 32, exportAsync: () => new Promise(resolve => { complete = resolve; }) };
    const p = plugin([a]); const pending = p.preview();
    p.figma.currentPage.selection = []; p.events.selectionchange();
    complete(new Uint8Array([1])); expect(await pending).toBeUndefined();
    p.figma.currentPage.selection = [a]; const old = p.preview(2); const finishOld = complete;
    const latest = p.preview(3); finishOld(new Uint8Array([2])); await old;
    expect(p.messages.some(m => m.type === "guide-preview")).toBe(false);
    complete(new Uint8Array([3])); expect((await latest).requestId).toBe(3);
  });
  test("reports invisible artwork, failed exports and oversized snapshots", async () => {
    const a = { ...layer("Art"), id: "a", width: 0, height: 0, async exportAsync() { return new Uint8Array([1]); } };
    expect((await plugin([a]).preview()).error).toContain("no visible artwork");
    a.width = a.height = 32;
    a.exportAsync = async () => { throw new Error("Export failed"); };
    expect((await plugin([a]).preview()).error).toBe("Export failed");
    a.exportAsync = async () => new Uint8Array(4 * 1024 * 1024 + 1);
    expect((await plugin([a]).preview()).error).toContain("too large");
  });
  test("requests a refresh when the active page artwork changes", async () => {
    const p = plugin([]); await Promise.resolve();
    p.pageEvents.nodechange();
    expect(p.messages.at(-1).type).toBe("guide-preview-dirty");
  });
});
