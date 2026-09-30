import { describe, expect, test } from "bun:test";

const { parseName, imageSizeFromBytes, KNOWN_TAGS, EFFECTS } = require("./extract.js");

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
