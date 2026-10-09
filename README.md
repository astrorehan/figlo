<img src="docs/brand/icon.svg" width="80" height="80" alt="Figlo icon" />

# Figlo

Bring a Figma frame into Roblox Studio as editable UI, with optional animation tags.

Figlo keeps text as TextLabels, uses native Roblox shapes where possible, and uploads
raster images for artwork Roblox cannot reproduce natively. Layout follows the design's
proportions. Fonts, masks, clipping and rasterization have limits; see
[compatibility](docs/compatibility.md) before expecting pixel-identical output.

**Status: alpha.** Local development plugins, a local relay, and a source build. Figlo is
an independent project, not affiliated with or endorsed by Figma or Roblox.

## Quickstart

**Just installing?** Follow the [download and installation guide](docs/install.md).
Prebuilt plugins are on [GitHub Releases](https://github.com/astrorehan/figlo/releases).
For model-driven workflows, see [Studio MCP integration (experimental)](docs/studio-mcp.md).

Requirements: Figma desktop, Roblox Studio, [Bun 1.3.10](https://bun.sh), and
[Rokit 1.2.0](https://github.com/rojo-rbx/rokit). Rojo and Lune are pinned in `rokit.toml`.
No npm packages, accounts for hosted services, or API keys are required.

```sh
rokit install
bun run build
bun run relay
```

1. In Figma desktop, use **Plugins > Development > Import plugin from manifest** and
   choose `figma/plugin/manifest.json` from this checkout. Run **Figlo**.
2. In Studio, install `build/Figlo.rbxm` as a local plugin. Copy it into your local
   Plugins folder, then restart Studio. On Windows this is normally
   `%LOCALAPPDATA%/Roblox/Plugins`; on macOS, `~/Documents/Roblox/Plugins`.
3. Enable **Allow HTTP Requests** in the place. Allow the Figlo plugin's requested
   HTTP and script permissions. Image uploading also needs the relevant asset API
   permissions in your Studio account; diagnose these using [troubleshooting](docs/troubleshooting.md).
4. The relay terminal prints a **pairing token**. Paste that same token into the Figlo
   panels in Figma and Studio. Keep it private. It changes each time the relay starts,
   unless you supply `FIGLO_TOKEN` yourself. Tokens are not stored by either plugin.
5. Select one frame in Figma, press **Export to Roblox**, then paste its six-character
   export code into Figlo in Studio and press **Import**.
6. Find `StarterGui.Figlo_<frame name>`. Use Play to check text, buttons and animation.
   Save the place to keep the imported objects. Uploaded images are Roblox assets.

For an original example with no external artwork, press **Create demo frame** in the
Figma plugin, then export it. `samples/demo.ir.json` is the corresponding headless test
fixture. The Figma-created version uses actual font measurements, so text bounds may
vary from the fixture. [Preview](docs/demo.svg).

## Re-import and pages

Re-import matches the Figma source (`FF_Source`), including a renamed ScreenGui. It
replaces the imported root and keeps the ScreenGui settings, root placement/visibility,
and `FF_*` effect values changed in Studio. Children added by hand *inside* that root
are replaced; keep custom objects outside it. The last replaced root per source is
stored in `ServerStorage.FigloBackups`. Undo works in the Studio plugin, including
cancellation of failed imports. Asset uploads are not reversed by Undo.

To add another frame as a page, select a Figlo ScreenGui and use **Import as page**.
Pages share a runtime; later pages start hidden. Tags such as `_goto:Details`, `_hide`
and `_smooth` supply navigation and button feedback. See [effects](docs/effects.md).

Existing imports made before the rename can still be located by `FF_Source`. Existing
`FrameFigRuntime`/`FrameFigClient` object names are preserved during re-import so game
scripts referencing them continue to work. New imports use `FigloRuntime`/`FigloClient`.
`FF_*` attributes, IR version 1 and browser driver globals remain stable. The secured
relay requires a pairing token for all clients; update older automation before using it.

## Privacy and local relay

Exports travel from Figma to the relay on **this computer**, then to Studio. There is no
hosted relay or telemetry. Images selected for import are uploaded to Roblox, which
applies its own ownership, moderation and availability rules. Figlo does not grant
permission to use someone else's designs, fonts, images or audio.

The relay binds only to IPv4/IPv6 loopback. Every export, image, source and deletion
request needs the pairing token. Browser origins are limited to Figma and opaque plugin
iframes; the token remains mandatory for those iframes. Host validation rejects other
hostnames. Never expose this relay through a tunnel or bind it to a public interface.

Exports are raw design JSON and pixels in `relay/.sessions/`. They expire **7 days after
creation**, checked on every access and every minute while the relay runs. Shutdown
pauses cleanup; the next startup removes expired files. Limits: 64 MiB per request,
4 MiB JSON header, 256 images, 1024 pixels per image side, 64 saved exports, 512 MiB
saved data and 64 MiB parsed-session cache. Invalid input is rejected before persistence.

Optional environment variables: `FIGLO_TOKEN` (32-128 letters/digits/underscores/hyphens),
`FIGLO_PORT` (default 34880), `FIGLO_SESSIONS` (storage directory). The desktop plugin
panels use port 34880; CLI callers may set `FIGLO_RELAY`. To delete one export early:

```sh
# Set FIGLO_TOKEN privately in your shell first; do not commit it.
curl -X DELETE -H "Authorization: Bearer $FIGLO_TOKEN" http://127.0.0.1:34880/exports/ABCDEF
```

In Windows PowerShell use `Invoke-RestMethod -Method Delete` with the same Authorization
header. The six-character export code selects data; it is not an authentication token.

## Script and runtime APIs

Place the modules from `studio/src` into a Folder through Rojo/Argon, retaining the
`Runtime/Effects` child and `Client` LocalScript. Required importer siblings are
`Builder`, `Crisp`, `FontMetrics`, `ImageKey` and `Protocol`.

```lua
local ff = game.ServerStorage.Figlo
local Importer = require(ff.Importer)
local gui, warnings = Importer.run("ABCDEF", {
    parent = game.StarterGui,
    token = "<pairing token from relay terminal>",
    runtime = ff.Runtime,
    client = ff.Client,
    -- into = game.StarterGui.MyPanel,
    -- crisp = false, -- retain exported pixels
    -- creatorId = 12345, creatorType = Enum.AssetCreatorType.Group,
})
```

Images default to the logged-in Studio user's ownership. For a group, supply both
`creatorId` and `creatorType`, and use an account allowed to create that group's assets.
Persist an `opts.cache` table to reuse uploads; its keys include pixel hash, source/target
dimensions and owner. Old hash-only cache keys are not reused.

`Importer.start(code, opts)` runs in a background thread and writes `FigloStatus`,
`FigloLog`, `FigloResult` and `FigloWarnings` to `opts.status` or the importer folder.
Direct callers must provide their own Undo recording; the plugin uses `ImportAction`.
Studio caches `require`, so after syncing modules require a fresh clone of their entire
Folder to use the new source.

The embedded Runtime provides `watch(container)`, `attach(object)`, `apply(container)`,
`setFxScale(object, value, channel)`, `setFxOffset(object, x, y, channel)` and
`setFxRotation(object, degrees, channel)`. Use `FF_Locked` and `FF_Active` for button states.

## Development and releases

```sh
bun run check          # tests, Luau compilation, generated-file and release checks
bun run build          # Figma plugin, optional web driver, Studio plugin
bun run package        # requires Python 3.10+ and clean Git; plugins, source and checksums
```

CI runs the same checks and builds on Windows and Linux. Tests execute the shipping
extractor, relay, builder and importer. Lune uses real serializable Roblox instances
with fake HTTP, upload and font-measurement services: it cannot prove Studio rendering,
account permissions or asset moderation. [Release verification](docs/release.md)
separates automated evidence from interactive checks.

The optional browser-console driver is for local development only. `bun tools/build_page.ts`
writes `out/figlo-page.min.js`, exposing `window.__ffrun(id)` and `window.__ffcopy()`.
`tools/push_clipboard.ts` sends its copied export using `FIGLO_TOKEN`. This depends on a
Figma web `figma` global and is not the supported Community installation path.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

MIT licensed. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
