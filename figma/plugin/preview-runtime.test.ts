import { expect, test } from "bun:test";
const { motion } = require("./preview-runtime.js");
const { EFFECTS } = require("../extract.js");
const node = { kind: "frame", pw: 200, ph: 80, rot: 7 };
const point = { x: .25, y: -.25, w: 200, h: 80 };
const parent = { w: 640, h: 400 };
test("an untagged parent has no automatic motion", () => {
  expect(motion(node, {}, 5, "hover", point, 5, parent)).toEqual({ x: 0, y: 0, angle: 7, sx: 1, sy: 1, opacity: 1 });
});
test("multiple tags compose rather than replacing each other", () => {
  const fx = { smooth: { hover: 1.2, press: .8 }, pulse: { rate: 1, amp: .1 }, spin: { speed: 30 }, lift: { amount: .1 } };
  const out = motion(node, fx, .25, "hover", point, 1, parent);
  expect(out.sx).toBeCloseTo(1.32); expect(out.sy).toBeCloseTo(1.32);
  expect(out.angle).toBeCloseTo(14.5); expect(out.y).toBe(-8);
});
test("every numeric effect produces finite results at default and boundary settings", () => {
  for (const [tag, spec] of Object.entries(EFFECTS) as any[]) {
    for (const side of ["def", "min", "max"]) {
      const values = Object.fromEntries(Object.entries(spec.params).map(([key, p]: any) => [key, p.type === "text" ? p.def : p[side]]));
      for (const t of [0, .1, 1, 5]) {
        const result = motion(node, { [tag]: values }, t, "hover", point, t, parent);
        for (const v of Object.values(result)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  }
});
test("entrances reset by visibility age while idle motion keeps its own clock", () => {
  const fx = { fade: { time: .5 }, spin: { speed: 90 } };
  expect(motion(node, fx, 10, "rest", point, 0, parent).opacity).toBe(0);
  expect(motion(node, fx, 10, "rest", point, 1, parent).opacity).toBe(1);
  expect(motion(node, fx, 10, "rest", point, 0, parent).angle).toBe(907);
});
