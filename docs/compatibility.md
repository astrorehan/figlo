# Compatibility

Figlo exports one selected frame, group or component. The root keeps its aspect
ratio; positions/sizes are relative Scale values. A Figma design is not turned
into game logic: connect your purchase, quest and other actions separately.

Native output includes uniform rounded corners, solid fills, linear gradients,
strokes supported by Roblox, editable uniform-style text, scrolling frames,
and auto layout requested with `_stack`/`_tiles`. Other art may be baked into
images. Uploads are capped at 1024 pixels per side. Image resizing targets a
1920x1080 reference viewport by default; `_native` retains design pixels for
reusable icon sheets, and tiled fills retain their source pixels.

Fonts must be available in Roblox's bundled font families. Unsupported families
fall back with a warning. Mixed font styles, letter spacing and unsupported
decorations can require image baking. Figma and Roblox text measurement and
rasterization differ: editable text is an approximation, not a pixel-identity
guarantee. Font bounds depend on Studio versions and platform.

Complex masks are approximated by their bounding boxes and reported as warnings.
Rounded clipping and rotated ancestors can differ from Figma's clipping behavior.
Shadows may create extra objects; auto-layout shadow children can require `_image`.
Use Play at desktop and mobile viewport sizes to judge the result.

The desktop Figma development plugin is the supported alpha workflow. The
optional browser-console driver depends on page internals and may break when
Figma changes. There is no claim of Community store approval or marketplace
publication. All networking is local except Roblox asset uploads.
