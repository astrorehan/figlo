// Original, asset-free geometry used by the sample and extractor regression tests.
export function node(type: string, id: string, name: string, x: number, y: number, width: number, height: number, extra: any = {}): any {
  return { type, id, name, x, y, width, height, visible: true, opacity: 1, rotation: 0,
    absoluteBoundingBox: { x, y, width, height }, absoluteRenderBounds: { x, y, width, height },
    absoluteTransform: [[1, 0, x], [0, 1, y]], fills: [], strokes: [], effects: [],
    cornerRadius: 0, children: [], clipsContent: false, layoutMode: "NONE",
    letterSpacing: { unit: "PIXELS", value: 0 }, paragraphSpacing: 0,
    arcData: { startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0 },
    getPluginData: () => "", ...extra };
}
export function demoFrame() {
  const paint = (r: number, g: number, b: number) => [{ type: "SOLID", color: { r, g, b } }];
  const root = node("FRAME", "demo:root", "Figlo Demo", 0, 0, 640, 400, { fills: paint(0.055, 0.075, 0.13), cornerRadius: 24 });
  const title = node("TEXT", "demo:title", "Title_txt", 40, 40, 560, 52, {
    characters: "Design. Import. Play.", fontSize: 36, fontName: { family: "Roboto", style: "Bold" },
    lineHeight: { unit: "PIXELS", value: 44 }, textAlignHorizontal: "LEFT", textAlignVertical: "TOP", textAutoResize: "NONE", fills: paint(0.95, 0.97, 1),
  });
  const card = node("FRAME", "demo:card", "Card_frame", 40, 122, 560, 156, { fills: paint(0.10, 0.14, 0.23), cornerRadius: 16 });
  const dot = node("ELLIPSE", "demo:dot", "Dot_pulse", 72, 158, 64, 64, { fills: paint(0.35, 0.87, 0.76) });
  const label = node("TEXT", "demo:label", "Caption_txt", 164, 156, 396, 58, {
    characters: "Figma to Roblox", fontSize: 26, fontName: { family: "Roboto", style: "Regular" },
    lineHeight: { unit: "PIXELS", value: 34 }, textAlignHorizontal: "LEFT", textAlignVertical: "TOP", textAutoResize: "NONE", fills: paint(0.82, 0.87, 0.96),
  });
  card.children = [dot, label];
  const button = node("FRAME", "demo:button", "Continue_smooth", 40, 310, 560, 52, { fills: paint(0.35, 0.87, 0.76), cornerRadius: 12 });
  root.children = [title, card, button];
  function parents(n: any) { for (const c of n.children) { c.parent = n; parents(c); } }
  parents(root);
  return root;
}
