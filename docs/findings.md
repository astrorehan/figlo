# Findings

## Historical private panel measurement

These measurements came from a development panel, not the public demo. The original
design is not distributed. `samples/demo.ir.json` is a separate, original fixture.

- 45 nodes checked by id against a hand-measured reference build. Every frame, image, button
  and mask lands at 0.0 px (position and size, in Figma px).
- Text baseline vs Figma ground truth (ink bottom of caps-only text): mean error 1.4 px.
  Centring the line box instead (the naive approach) puts titles up to 20 px too high.
- Bug found and fixed: Figma lets text overflow a fixed-height box, Roblox hides wrapped lines
  that do not fit. Builder now grows the label downward to fit all lines.
- Image nodes use render bounds directly instead of a node-box Frame wrapping the image;
  unrounded masks are a clipping Frame, not a CanvasGroup (cheaper, same look).

## Roblox text

- Line box = TextSize covering ascender+descender; baseline at `asc/(asc+desc) * TextSize`.
- To match Figma em size `s`: `TextSize = s * (asc+desc)/unitsPerEm`.
- LineHeight only adds space between lines. TextSize floors to an integer, max 100.
- UIScale scales around AnchorPoint.

## Figma text

- First baseline (TOP): `top + (L - line*s)/2 + ascEm*s`, `L` = explicit line height or `line*s`.
- Line count = `max(hardLines, round(inkH / L))`.

## Figma paints

- gradientTransform row 0 `(a, b, c)`: `t = a*px + b*py + c`; angle = `atan2(b, a)`.
- Rotation sign is opposite to Roblox; mirrored transforms (det < 0) must be baked to an image.
- `exportAsync` output = absoluteRenderBounds, clipped by masks.

## Sharp images

- Roblox mipmaps every uploaded image. Drawn smaller than its pixels it blends in the half-size
  level and looks soft; Figma draws vectors at screen resolution, so 1x exports looked blurrier
  in game than in Figma (a panel fitted to a 1080p screen is ~0.83x its design, a side rail
  ~0.58x; a small design is enlarged instead, 2.7x for a close button).
- So images are sized for a 1920 x 1080 screen (`FF_SCREEN` in extract.js, the IR's `screen`):
  Figma exports at the root's fit scale (at most 2x, at most 1024 px a side), and
  `studio/src/Crisp.luau` shrinks each image to the pixels it covers there (the root's current
  Size counts, so re-importing a resized root re-sizes its images) with a Catmull-Rom filter on
  premultiplied colour before upload. Images are never enlarged in Studio.
- `_native` on a frame keeps design pixels for the images inside it: icon sheets whose asset ids
  code reuses at other sizes. Tiled fills keep theirs too.
- Each upload is cached by pixels and target size (`sha@WxH`), so a re-import at the same size
  reuses its uploads.

## Figma images

- `getImageByHash(h).getSizeAsync()` can fail with "Image dimensions not available" for an image
  fill the page has not drawn yet. Calling `getBytesAsync()` first loads it; the extractor also
  reads the size from the PNG/JPEG/GIF/WebP header as a fallback (`imageSizeFromBytes`).
- Content below a `_scroll` frame's fold is clipped by the scroll frame and every clipping
  ancestor, so it measures and exports as 1×1. The extractor lifts exactly those clips while it
  measures or exports one node (`withoutFold`).
- `node.clone()` of a node inside an instance lands on the page, not beside the original: place
  it with `absoluteTransform`. A hug-contents auto-layout clone collapses once its children are
  removed, so freeze `layoutMode` first.
