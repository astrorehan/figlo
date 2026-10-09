import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
const { catalogue } = require("./tag-guide.js");
const { KNOWN_TAGS, parseName } = require("../extract.js");

function layer(name: string, saved: any = {}) {
  let data = JSON.stringify(saved);
  return { name, getPluginData: () => data, setPluginData: (_: string, value: string) => { data = value; }, data: () => JSON.parse(data) };
}
function plugin(nodes: ReturnType<typeof layer>[]) {
  const messages: any[] = [];
  const figma: any = { showUI() {}, on() {}, currentPage: { selection: nodes }, ui: { postMessage(m: any) { messages.push(m); } } };
  const context = createContext({ figma, __html__: "" });
  runInContext(readFileSync(new URL("../extract.js", import.meta.url), "utf8") + "\n" + readFileSync(new URL("./main.js", import.meta.url), "utf8"), context);
  return { messages, async apply(tag: string, params: any = {}, value = "") {
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
});
