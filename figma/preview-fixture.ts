// Original, asset-free shop UI for browser interaction checks.
export function shopPreview() {
  const fill = (c: number[]) => ({ c, a: 1 });
  const box = (id: string, name: string, x: number, y: number, w: number, h: number, extra: any = {}) => ({ id, name, kind: "frame", x, y, w, h, pw: w * 640, ph: h * 440, ...extra });
  const label = (id: string, value: string, x: number, y: number, w: number, h: number, size = 24) => box(id, id, x, y, w, h, { kind: "text", text: { value, family: "Arial", style: "Bold", size, hardLines: 1, alignX: "CENTER", alignY: "TOP", fill: fill([.93, .96, 1]) } });
  const buy = box("buy", "Buy", .5, .81, .52, .12, { tags: { button: true, smooth: true, splash: true }, fx: { smooth: { hover: 1.15, press: .85, time: .08 }, button: { hoverDim: .75, pressDim: .5 } }, fill: fill([.98, .71, .23]), radius: 14 });
  buy.children = [
    box("buy-icon", "Coin", .12, .5, .10, .6, { kind: "image", image: "coin", pw: 32, ph: 32 }),
    box("nodim", "Bright badge", .9, .5, .08, .5, { kind: "image", image: "coin", tags: { nodim: true }, pw: 28, ph: 28 }),
    label("buy-label", "BUY · 500", .5, .5, .65, .6, 23),
    box("hover", "Hover highlight", .5, .5, 1, 1, { tags: { when: "hover|press" }, stroke: { w: 3, c: [1, 1, 1], a: .7 }, radius: 14 }),
  ];
  const details = box("details", "Details", .5, .45, .5, .34, { tags: { pop: true, tide: true }, fill: { grad: { rot: 90, keys: [[0, .24, .3, .4, 1], [1, .12, .17, .26, .9]] } }, radius: 16, children: [
    label("details-text", "ITEM DETAILS", .5, .25, .8, .2, 22),
    box("close", "Close", .5, .75, .6, .3, { tags: { button: true, hide: "Details" }, fill: fill([.35, .45, .6]), radius: 8, children: [label("close-text", "CLOSE", .5, .5, .9, .7, 18)] }),
  ] });
  const scroll = box("scroll", "Inventory", .82, .52, .2, .36, { kind: "scroll", tags: { scroll: true }, canvasW: 1, canvasH: 3, fill: fill([.12, .17, .25]), radius: 10, children: Array.from({ length: 6 }, (_, i) => box("item" + i, "Item " + i, .5, (i + .5) / 6, .9, .15, { fill: fill([.2 + i * .02, .3, .4]), radius: 6 })) });
  return { design: { w: 640, h: 440 }, warnings: [], root: box("shop", "Shop", .5, .5, 1, 1, { fill: { grad: { rot: 90, keys: [[0, .1, .15, .23, 1], [1, .055, .085, .14, 1]] } }, radius: 24, children: [
    { ...label("title", "SHOP", .5, .13, .7, .1, 34), textImage: "shop-title", textImageBox: { x: .5, y: .59091, w: 464 / 448, h: 64 / 44, rot: 0 }, tags: { gleam: true } },
    box("sparkle", "Sparkle", .13, .28, .07, .10, { kind: "image", image: "coin", tags: { pulse: true, spin: true }, fx: { pulse: { amp: .12, rate: 1 }, spin: { speed: 30 } } }),
    box("clothes", "Clothes", .19, .53, .25, .18, { fill: fill([.13, .2, .32]), radius: 12 }),
    box("tools", "Tools", .19, .53, .25, .18, { fill: fill([.25, .16, .33]), radius: 12 }),
    box("tab-clothes", "Clothes tab", .125, .37, .13, .07, { tags: { button: true, goto: "Clothes" }, fill: fill([.25, .35, .48]), radius: 6 }),
    box("tab-tools", "Tools tab", .27, .37, .13, .07, { tags: { button: true, goto: "Tools" }, fill: fill([.25, .35, .48]), radius: 6 }),
    box("show", "Open details", .17, .7, .21, .08, { tags: { button: true, show: "Details" }, fill: fill([.22, .5, .53]), radius: 8 }),
    box("toggle", "Toggle details", .84, .77, .2, .08, { tags: { button: true, switch: "Details" }, fill: fill([.22, .5, .53]), radius: 8 }),
    box("missing", "External target", .84, .9, .2, .06, { tags: { button: true, show: "Outside" }, fill: fill([.3, .35, .4]), radius: 6 }),
    buy, scroll, details,
  ] }) };
}
