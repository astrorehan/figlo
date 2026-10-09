# Tags

Select one frame or layer and open **Tag Guide** to see your design in the preview.
Browse tags, hover or press the selected artwork, replay entrances, and adjust
settings before applying them. Selecting another layer updates the preview.
Navigation, child layout, text fitting, gradients and tiled fills run in Roblox;
their guide entries keep the selected artwork visible and explain the tag.
The preview does not change your document. **Add to selected layer** applies
the tag and its current settings. Applying an existing tag updates it.
Sounds are saved as asset IDs and only play in Roblox.

A layer gets a tag from a name suffix in Figma (`Play_smooth`, `Burst_rays`). The suffix is
stripped from the Roblox name, so `Play_smooth` becomes `Play`. Several tags can be chained
(`Badge_pulse_image`). A few tags take a value after a colon (`Tab_goto:Gems`); a value cannot
contain `_`.

Each tag's values are edited in the Figma plugin's **Effects** tab and saved on the layer with
`setPluginData('fx')`, never in the name. On import they become attributes
`FF_<tag>_<param>` on the built object (e.g. `FF_drift_speed = 40`), which can be tuned in Studio.
`FF_<tag> = false` switches an effect off for one object. Re-importing keeps values changed in
Studio (see the README).

The effects run in `studio/src/Runtime/Effects.luau`, started by `FigloClient` in Play.

Any other lowercase suffix that looks like a tag (`Rays_breath`) produces an import warning, so a
typo is not silently ignored.

## Composition

- **Scale.** Every object has at most one `UIScale` (`FF_Scale`). Its value is the text-fit
  factor times one factor per channel (`button`, `idle`, `pop`, `stagger`), so a button that
  pulses and is hovered does not fight itself. Roblox honours only one UIScale per object: to
  scale a Figlo object from your own code, call `Runtime.setFxScale(obj, k, "mychannel")` or
  scale a wrapper.
- **Position and rotation** work the same way (`Runtime.setFxOffset`, `Runtime.setFxRotation`):
  the object sits at its Figma place plus the sum of its channels (float, lift, slide, sway...).
  The place is read when the first effect moves it, so if your code moves the object too, move a
  wrapper instead.
- **Companions.** Drop shadows (`<name>Shadow`) and baked backgrounds (`<name>Bg`) move and scale
  with their layer.
- **Visibility.** Idle and pointer effects stop ticking while the page is hidden (a hidden
  GuiObject up the chain, or a disabled ScreenGui). Entrances keep watching so they replay on the
  next show.
- **Random phase.** Idle loops start at a random phase per layer, so a grid of cards never moves
  in step.
- **Buttons.** A pointer effect on a layer inside a button reacts to that button; outside a
  button it reacts to the layer itself.

## Buttons

| Tag | Put it on | What it does | Parameters (default) |
|---|---|---|---|
| `_button` | a frame or image | clickable; images inside darken on hover/press (`_nodim` skips one) | `hoverDim` 0.8, `pressDim` 0.62 |
| `_smooth` | a frame or image | button that grows on hover and shrinks on press, with sounds (implies `_button`) | `hover` 1.08, `press` 0.9, `time` 0.15, `hoverSound`, `clickSound` (0 = silent) |
| `_when:<state>` | a layer inside a button | shown only in that state: `hover`, `press`, `rest`, `locked`, `active`; several as `hover\|press` | |

A button has one state at a time; the first that applies wins: `locked`, `active`, `press`,
`hover`, `rest`. Your code locks a button with `button:SetAttribute("FF_Locked", true)`: its
effects stop reacting, navigation tags do nothing, and `_when:locked` layers show (your own click
handlers still fire, so check the attribute there too). `active` is set by `_goto` (below) or by
your code with `FF_Active`.

Sounds are silent by default. Supply audio IDs your experience has permission to use.

## Navigation

These make the layer a button and act when it is clicked. Names are looked up in the button's
ScreenGui: first a page (the ScreenGui's own frame, or a frame added with **Import as page**), then
any layer of that name, then another ScreenGui beside it named `<name>` or `Figlo_<name>`.

| Tag | What it does |
|---|---|
| `_goto:<page>` | shows that page and hides the other pages of the ScreenGui (sets the ScreenGui attribute `FF_Page`). For a layer instead of a page, hides the other `_goto` targets that share its parent. The button gets `FF_Active` while its target shows, so `_when:active` marks the current tab. |
| `_show:<name>` | shows the layer, page, or ScreenGui (`Enabled`). |
| `_hide` | closes its own ScreenGui (`Enabled = false`); `_hide:<name>` hides that one instead. |
| `_switch:<name>` | shows it if hidden, hides it if shown. |

A tabbed shop: one Figma frame per tab, the first imported normally and the rest with **Import
as page**. Every page has the same tab bar with `Cash_goto:ShopCash`, `Gems_goto:ShopGems`...,
each tab holding a `_when:active` highlight; the close button is `Close_hide`. A HUD button in
another ScreenGui opens it with `Shop_show:ShopCash`.

## Idle motion

| Tag | Put it on | What it does | Parameters (default) |
|---|---|---|---|
| `_spin` | anything | turns forever | `speed` 90°/s |
| `_rays` | a burst image | square: turns forever; wide: swings ±8°; both breathe | `speed` 20°/s, `amp` 0.06, `rate` 0.5 |
| `_pulse` | anything | grows and shrinks | `amp` 0.05, `rate` 1 |
| `_float` | anything | bobs up and down | `amp` 0.06 of own height, `rate` 0.45 |
| `_sway` | anything | rocks from side to side, like a hanging sign | `angle` 6, `rate` 0.4 |
| `_wobble` | a frame or image | squashes and stretches, like jelly | `amp` 0.05, `rate` 1.2 |
| `_blink` | a sparkle | shrinks and fades in a quick twinkle | `rate` 0.7, `min` 0.55, `fade` 0.7 |
| `_wiggle` | anything | every few seconds, a short decaying twist | `every` 4, `time` 0.7, `angle` 10 |
| `_jitter` | anything | every few seconds, a short shiver in place | `every` 3, `time` 0.35, `amount` 0.04 of own height |
| `_halo` | a shape, image or text | a soft outline that brightens and dims | `color` FFFFFF, `size` 6 px, `rate` 0.8, `low` 0.15, `high` 0.7 |
| `_tide` | a layer with a gradient fill | the gradient slides back and forth (and turns) | `amp` 0.3, `rate` 0.25, `turn` 0°/s |
| `_drift` | a tiled image fill | the pattern scrolls forever; copies on different pages stay in phase | `speed` 40 px/s, `angle` 270 (0 = up, 90 = right) |

`_halo` on text uses the text outline: it adds one if the text has none, and tints an existing
one toward the halo colour. On a frame or image it draws an outer stroke around the box
(rounded corners follow; the transparent parts of an image do not).

## Pointer

| Tag | What it does | Parameters (default) |
|---|---|---|
| `_lift` | rises while hovered | `amount` 0.08 of own height, `time` 0.15 |
| `_tip` | leans toward the pointer while hovered | `angle` 6, `time` 0.15 |
| `_pull` | follows the pointer a little while hovered | `strength` 0.12, `time` 0.12 |
| `_sheen` | one light sweep across the shape each time the pointer enters | `time` 0.5, `width` 0.3, `opacity` 0.6, `angle` 20 |
| `_splash` | a circle spreads from where it is pressed | `color` FFFFFF, `opacity` 0.35, `time` 0.45 |

`_sheen` needs a filled shape or an image (put it on a button's background, not on the
transparent button frame).

## Light

| Tag | Put it on | What it does | Parameters (default) |
|---|---|---|---|
| `_shiny` | a filled shape, or a drawn shine image | a light band sweeps across it, then rests | `time` 0.7, `cooldown` 2, `width` 0.25, `opacity` 0.5, `angle` 20 |
| `_gleam` | a text layer | a white light crosses the text fill and outline | `time` 0.8, `cooldown` 2, `width` 0.22 |

## Entrances

Each plays whenever the layer becomes visible (page shown, ScreenGui enabled), including at start.

| Tag | What it does | Parameters (default) |
|---|---|---|
| `_pop` | pops in | `from` 0.8, `time` 0.3 |
| `_fade` | fades in (as one piece when it is a `_group`) | `time` 0.35 |
| `_slide` | slides into place | `distance` 0.25 of parent, `angle` 180 (comes from: 0 = above, 90 = right), `time` 0.4 |
| `_stagger` | its children pop in one after another, in reading order | `gap` 0.06 s, `from` 0, `time` 0.25 |

## Structure

| Tag | Effect on import |
|---|---|
| `_image`, `_img`, `_lock`, `#` prefix | bake the layer (and everything inside) to one image |
| `_frame` | keep a container live even if it could be flattened |
| `_keep` | same, for a group of vectors that would otherwise merge into one image |
| `_ignore` | skip the layer |
| `_scroll` | the frame becomes a `ScrollingFrame`; content past its edge is the scroll area |
| `_txt` | text your code will change: in game it shrinks to stay inside its box, and grows back for shorter text |
| `_ratio` | adds a `UIAspectRatioConstraint` with the Figma width/height |
| `_group` | the frame becomes a `CanvasGroup`, so it fades and tints as one (not on buttons) |
| `_stack` | on an auto-layout frame: a `UIListLayout` (+ `UIPadding`) with Figma's direction, gap, padding and alignment, so rows your code clones in line up |
| `_tiles` | on a wrapping auto-layout frame: a `UIGridLayout` with the first child's size as the cell |
| `_nodim` | inside a `_button`: this image does not darken |
| `_native` | images inside keep their design pixels (icon sheets whose ids your code shows at other sizes); see "Sharp images" in `docs/findings.md` |

Children of `_stack`/`_tiles` should not have drop shadows (each shadow is its own Roblox object
and would take a cell); bake them with `_image`. Roblox layouts ignore `AnchorPoint` and place
children by their top-left corner; the importer converts sizes for that.
