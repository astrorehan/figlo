# Script and runtime APIs

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


## Existing imports

Existing imports made before the rename can still be located by `FF_Source`. Existing
`FrameFigRuntime`/`FrameFigClient` object names are preserved during re-import so game
scripts referencing them continue to work. New imports use `FigloRuntime`/`FigloClient`.
`FF_*` attributes, IR version 1 and browser driver globals remain stable. The secured
relay requires a pairing token for all clients; update older automation before using it.

