# Findings

## Flash panel test (samples/flash.ir.json)

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

## Open

- Tile image pixel size should come from `getImageByHash().getSizeAsync()` (hardcoded 700×700 now).
- Drop-shadow-only PNG needs a temporary clone during export.
