import { describe, expect, test } from "bun:test";
import { demoFrame, node } from "./fixtures";

const { extract, parseName, imageSizeFromBytes, linearGradient, KNOWN_TAGS, EFFECTS } = require("./extract.js");

describe("parseName", () => {
  test("strips known tags and keeps the base name", () => {
    const m = parseName("Play_smooth");
    expect(m.name).toBe("Play");
    expect(m.tags).toEqual({ smooth: true, button: true });
    expect(m.unknown).toBeNull();
  });

  test("chained tags and tag values", () => {
    const m = parseName("Badge_pulse_image");
    expect(m.name).toBe("Badge");
    expect(m.tags.pulse).toBe(true);
    expect(m.bake).toBe(true);
    expect(parseName("Shop_goto:Cash").tags.goto).toBe("Cash");
  });

  test("reports a suffix that looks like a mistyped tag", () => {
    const m = parseName("Rays_breath");
    expect(m.name).toBe("Rays_breath");
    expect(m.tags).toEqual({});
    expect(m.unknown).toBe("breath");
    expect(parseName("Glow_breath_pulse").unknown).toBe("breath");
  });

  test("does not report ordinary names", () => {
    expect(parseName("image 11").unknown).toBeNull();
    expect(parseName("Card_2").unknown).toBeNull();
    expect(parseName("Shop • Cash").unknown).toBeNull();
    expect(parseName("Row_A").unknown).toBeNull();
  });

  test("_nodim is a tag, so the runtime sees FF_nodim", () => {
    const m = parseName("Icon_nodim");
    expect(m.name).toBe("Icon");
    expect(m.tags.nodim).toBe(true);
  });

  test("_native is a tag and does not bake", () => {
    const m = parseName("Index Icons_native");
    expect(m.name).toBe("Index Icons");
    expect(m.tags.native).toBe(true);
    expect(m.bake).toBeFalsy();
    expect(m.unknown).toBeNull();
  });

  test("navigation tags make a button", () => {
    for (const tag of ["goto:Cash", "show:Shop", "hide", "switch:Menu"]) {
      expect(parseName("Tab_" + tag).tags.button).toBe(true);
    }
    expect(parseName("HoverLook_when:hover|press").tags.when).toBe("hover|press");
    expect(parseName("Icon_sway").tags.button).toBeUndefined();
  });

  test("retired names warn instead of being dropped silently", () => {
    for (const old of ["jelly", "glint", "cascade", "tab", "close"]) {
      expect(parseName("Layer_" + old).unknown).toBe(old);
    }
  });

  test("every tunable effect is a known tag", () => {
    for (const tag of Object.keys(EFFECTS)) expect(KNOWN_TAGS.has(tag)).toBe(true);
  });
});

describe("extractor layout contract", () => {
  (globalThis as any).figma = { fileKey: "figlo-demo" };
  test("keeps nested relative geometry, text, buttons and effect parameters", () => {
    const ir = extract(demoFrame());
    expect(ir.design).toEqual({ w: 640, h: 400 });
    const [title, card, button] = ir.root.children;
    expect(title.kind).toBe("text"); expect(title.text.value).toBe("Design. Import. Play.");
    expect(card.x).toBe(0.5); expect(card.y).toBe(0.5);
    expect(card.children[0].x).toBeCloseTo(64 / 560, 4);
    expect(button.button).toBe(true); expect(button.fx.smooth.hover).toBe(1.08);
    expect(ir.images).toEqual({}); expect(ir.warnings).toEqual([]);
  });
  test("ignores hidden and tagged layers; bakes vector shapes", () => {
    const root = demoFrame();
    root.children.push(node("RECTANGLE", "ignored", "Hidden", 0, 0, 10, 10, { visible: false }), node("RECTANGLE", "ignore", "Ignore_ignore", 0, 0, 10, 10));
    const vector = node("VECTOR", "vector", "Vector_pulse", 0, 0, 10, 10); vector.parent = root; root.children.push(vector);
    const ir = extract(root);
    expect(ir.root.children).toHaveLength(4); expect(ir.root.children[3].kind).toBe("image"); expect(ir.images.vector.node).toBe("vector");
  });
  test("propagates native export size and captures auto layout", () => {
    const root = demoFrame(); root.name += "_native";
    const card = root.children[1]; card.name = "Card_stack"; card.layoutMode = "VERTICAL"; card.itemSpacing = 12; card.paddingLeft = 20;
    const vector = node("VECTOR", "vector", "Vector_image", 0, 0, 10, 10); vector.parent = card; card.children.push(vector);
    const ir = extract(root), layout = ir.root.children[1];
    expect(layout.layout.dir).toBe("VERTICAL"); expect(layout.layout.gap).toBe(12); expect(layout.layout.pad[0]).toBe(20);
    expect(layout.children[2].native).toBe(true); expect(ir.images.vector.scale).toBe(1);
  });
  test("retains mask children and warns on unsupported mask geometry", () => {
    const root = demoFrame(), mask = node("VECTOR", "mask", "Mask", 20, 20, 100, 100, { isMask: true });
    const child = node("RECTANGLE", "inside", "Inside_frame", 30, 30, 20, 20);
    mask.parent = root; child.parent = root; root.children = [mask, child];
    const ir = extract(root);
    expect(ir.root.children[0].kind).toBe("clip"); expect(ir.root.children[0].children[0].name).toBe("Inside");
    expect(ir.warnings[0]).toContain("mask approximated");
  });
  test("resamples linear gradient endpoints and opacity", () => {
    const gradient = linearGradient({ gradientTransform: [[1, 0, 0], [0, 1, 0]], opacity: 0.5,
      gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }] });
    expect(gradient.rot).toBe(0); expect(gradient.keys).toEqual([[0, 1, 0, 0, 0.5], [1, 0, 0, 1, 0.5]]);
  });
});

describe("imageSizeFromBytes", () => {
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

  test("PNG", () => {
    const b = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(700), ...be32(350), 8, 6, 0, 0, 0]);
    expect(imageSizeFromBytes(b)).toEqual({ width: 700, height: 350 });
  });

  test("JPEG (SOF0 after an APP0 segment)", () => {
    const b = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0, 0, 0, 0, 0, 0,
    ]);
    expect(imageSizeFromBytes(b)).toEqual({ width: 600, height: 300 });
  });

  test("GIF", () => {
    const b = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00, 0, 0]);
    expect(imageSizeFromBytes(b)).toEqual({ width: 320, height: 240 });
  });

  test("unknown bytes", () => {
    expect(imageSizeFromBytes(new Uint8Array(40))).toBeNull();
  });
});
