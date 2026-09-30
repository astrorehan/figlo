# FrameFig

Figma → Roblox Studio UI importer. Select a frame in Figma, export it, paste a six-letter code in
Studio, and get a ScreenGui that matches the design 1:1: Scale-based layout, real TextLabels on
the same baselines as Figma, native gradients/strokes/corners where Roblox can draw them, and
baked images where it cannot. Layer-name tags (`_smooth`, `_pulse`, `_drift`...) add button
feedback and idle animation in game.

## How it works

```
Figma plugin (figma/)          local relay (relay/)           Studio plugin (studio/src/)
extract IR + export PNGs  -->  holds the export under  -->   pulls by code, uploads images,
                               a short code                   builds the ScreenGui
```

1. `figma/extract.js` walks the selected node and writes an IR JSON document (layout, text,
   paints, image keys, tags). `figma/plugin/` wraps it in a Figma plugin with an Export tab and
   an Effects tab for tag parameters.
2. `relay/relay.ts` (Bun, loopback only) receives the export and hands out a code. Exports are
   also written to `relay/.sessions/`, so a relay restart does not lose them.
3. `studio/src/Importer.luau` pulls the export, uploads each image with
   `AssetService:CreateAssetAsync` (with a sha1 cache so identical pixels are uploaded once),
   and `Builder.luau` builds the UI.
4. `Runtime/` and `Client.client.luau` ship inside the built ScreenGui: they keep text sizes
   proportional (TextSize is an integer ≤ 100; a UIScale supplies the fraction) and run the
   tag effects (`docs/effects.md`).

## Setup

- [Bun](https://bun.sh) for the relay and build scripts; [Rokit](https://github.com/rojo-rbx/rokit)
  installs Rojo and Lune from `rokit.toml`.
- Figma: `bun tools/build_figma.ts`, then *Plugins → Development → Import plugin from manifest*
  and pick `figma/plugin/manifest.json`.
- Studio: `rojo build plugin.project.json -o FrameFig.rbxm` and put the file in your Plugins
  folder. Enable *Allow HTTP Requests* in the place (the importer talks to the relay on
  `127.0.0.1:34880`).
- Relay: `bun relay/relay.ts` (or `relay/start.cmd` on Windows).

Without the Figma desktop plugin (e.g. figma.com in a browser you drive with a script),
`bun tools/build_page.ts` writes `out/ffpage.min.js`, a paste-in driver exposing
`window.__ffrun(nodeId)` and `window.__ffcopy()`; `bun tools/push_clipboard.ts` then pushes the
copied export to the relay (it reads the clipboard itself when no file is given).

## Importing

Paste the code in the FrameFig widget and press **Import**. The result is
`StarterGui.FrameFig_<frame name>`.

- **Re-import updates in place.** The importer finds the earlier import of the same Figma node
  (by its `FF_Source` attribute, so a renamed ScreenGui is still found) and replaces it. Kept from
  the old copy: the ScreenGui's `Enabled`, `DisplayOrder`, `ResetOnSpawn` and `IgnoreGuiInset`;
  the root's `AnchorPoint`, `Position`, `Size` and `Visible` if you changed them in Studio; and
  every `FF_*` effect attribute you changed in Studio (for example `FF_drift_angle` or
  `FF_rays = false`). Values changed in Figma still come through when Studio left them alone.
- **Pages.** Select a ScreenGui built by FrameFig and press **Import as page**: the frame is added
  to that ScreenGui inside a Folder named after it (hidden unless it is the first page), sharing
  one runtime. That is how a tabbed panel is made from one Figma frame per tab. Re-importing a
  page replaces it inside its Folder.
- **Warnings** go to Output: fonts Roblox does not have, masks approximated by a box, tags that
  look like typos, and images still waiting for Roblox moderation (they appear on their own once
  approved; do not re-upload).

Tags are listed in `docs/effects.md`.

### From a script

```lua
local ff = game.ServerStorage.FrameFig -- a folder holding Importer, Builder, FontMetrics, Runtime, Client
local Importer = require(ff.Importer)
local gui, warnings = Importer.run("K7P2QX", {
	parent = game.StarterGui,
	runtime = ff.Runtime,
	client = ff.Client,
	-- into = game.StarterGui.Shop,    -- import as a page of an existing FrameFig ScreenGui
})
```

`Importer.start(code, opts)` does the same in a background thread and reports progress in the
attributes `FrameFigStatus` / `FrameFigLog` of `opts.status` (default: the folder holding the
Importer), for callers with a time limit.

Studio caches `require` results. After replacing the modules' `Source`, require a fresh
`:Clone()` of the whole folder, or the old code keeps running without an error.

### Runtime API

- `Runtime.watch(container)`: fit text and start effects for a ScreenGui or a page Folder. The
  shipped client calls it for the ScreenGui and for every page Folder in it.
- `Runtime.attach(object)`: start the effects of a cloned subtree that lives outside its
  ScreenGui (a button template cloned by your code), including the object itself.
- `Runtime.apply(container)`: fit text once (useful in Edit mode, where no scripts run).
- `Runtime.setFxScale(object, k, channel)`: contribute to an object's single `UIScale`.

## Development

- `lune run tools/check_luau` compiles every Luau file.
- `bun test` runs the extractor tests (`figma/extract.test.ts`).
- `bun relay/test_push_noimg.ts` pushes `samples/flash.ir.json` for a dry-run import.
- `python tools/gen_fonts.py` regenerates `FontMetrics.luau` from the fonts bundled with Studio.
- `docs/findings.md` records the measured Figma/Roblox behaviour the layout math relies on.
