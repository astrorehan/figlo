# Effects

A layer gets an effect from a name suffix in Figma (`Play_smooth`, `Burst_rays`). The suffix is
stripped from the Roblox name, so `Play_smooth` becomes `Play`. Several tags can be chained
(`Badge_pulse_image`).

Each tag's values are edited in the Figma plugin's **Effects** tab and saved on the layer with
`setPluginData('fx')`, never in the name. On import they become attributes
`FF_<tag>_<param>` on the built object (e.g. `FF_drift_speed = 40`), which can be tuned in Studio.
`FF_<tag> = false` switches an effect off for one object. Re-importing keeps values changed in
Studio (see the README).

The effects run in `studio/src/Runtime/Effects.luau`, started by `FrameFigClient` in Play.

## Composition

- **Scale.** Every object has at most one `UIScale` (`FF_Scale`). Its value is the text-fit
  factor times one factor per channel (`button`, `idle`, `pop`), so a button that pulses and is
  hovered does not fight itself. Roblox honours only one UIScale per object: to scale a FrameFig
  object from your own code, call `Runtime.setFxScale(obj, k, "mychannel")` or scale a wrapper.
- **Companions.** Drop shadows (`<name>Shadow`) and baked backgrounds (`<name>Bg`) move and scale
  with their layer.
- **Visibility.** Idle effects stop ticking while the page is hidden (a hidden GuiObject up the
  chain, or a disabled ScreenGui). `_pop` keeps watching so it can replay on the next show.
- **Random phase.** Idle loops start at a random phase per layer, so a grid of cards never moves
  in step.

## Tags that run today

| Tag | Put it on | What it does | Parameters (default) |
|---|---|---|---|
| `_button` | a frame or image | clickable; images inside darken on hover/press (`_nodim` skips one) | `hoverDim` 0.8, `pressDim` 0.62 |
| `_smooth` | a frame or image | button that grows on hover and shrinks on press, with sounds (implies `_button`) | `hover` 1.08, `press` 0.9, `time` 0.15, `hoverSound`, `clickSound` (0 = silent) |
| `_shiny` | a filled shape, or a drawn shine image | a light band sweeps across it, then rests | `time` 0.7, `cooldown` 2, `width` 0.32, `opacity` 0.9, `angle` 25 |
| `_gleam` | a text layer | a white light crosses the text fill and outline | `time` 0.8, `cooldown` 2, `width` 0.22 |
| `_drift` | a tiled image fill | the pattern scrolls forever; copies on different pages stay in phase | `speed` 40 px/s, `angle` 270 (0 = up, 90 = right) |
| `_rays` | a burst image | square: turns forever; wide: swings ±8°; both breathe | `speed` 20°/s, `amp` 0.06, `rate` 0.5 |
| `_spin` | anything | turns forever | `speed` 90°/s |
| `_pulse` | anything | grows and shrinks | `amp` 0.05, `rate` 1 |
| `_float` | anything | bobs up and down | `amp` 0.06 of own height, `rate` 0.45 |
| `_blink` | a sparkle | shrinks and fades in a quick twinkle | `rate` 0.7, `min` 0.55, `fade` 0.7 |
| `_wiggle` | anything | every few seconds, a short decaying shake | `every` 4, `time` 0.7, `angle` 10 |
| `_pop` | a page root or card | pops in whenever it becomes visible | `from` 0.8, `time` 0.3 |

The default sounds are public Creator Store audio (hover `139800881181209`, click
`102702078778790`).

## Structural tags

| Tag | Effect on import |
|---|---|
| `_image`, `_img`, `_lock`, `#` prefix | bake the layer (and everything inside) to one image |
| `_frame` | keep a container live even if it could be flattened |
| `_keep` | same, for a group of vectors that would otherwise merge into one image |
| `_ignore` | skip the layer |
| `_scroll` | the frame becomes a `ScrollingFrame`; content past its edge is the scroll area |

## Reserved, not built yet

These names are recognised (so they are stripped from layer names and do not warn), but nothing
runs for them yet: `_up`, `_magnet`, `_select`, `_3d`, `_tilt`, `_hover`, `_clicked`, `_default`,
`_disabled`, `_active`, `_tab`, `_open`, `_toggle`, `_close`, `_panel`, `_lean`, `_jelly`,
`_shake`, `_reveal`, `_swing`, `_drop`, `_cascade`, `_fadein`, `_glint`, `_glow`, `_flow`,
`_shadow`, `_list`, `_grid`, `_aspect`, `_fit`, `_canvas`, `_txt`.

Any other lowercase suffix that looks like a tag (`Rays_breath`) produces an import warning, so a
typo is not silently ignored.

Ideas for the reserved ones, in rough priority:

- `_glow`: a stroke whose thickness breathes.
- `_shake`: every few seconds, a short positional jitter.
- `_jelly`: a small idle rotation plus a scale wobble at double frequency.
- `_glint`: one `_shiny` pass on hover only.
- `_cascade`: `_pop` staggered over the children.
- `_hover` / `_clicked` / `_disabled` state layers: children shown only in that button state.
- `_tab:Name`, `_open:Name`, `_close`: navigation without code.
