# Import through Studio MCP (experimental)

Figlo's Luau importer can be invoked through a Studio MCP connection that exposes
Luau execution in edit mode. No separate Figlo MCP server is required. The model
uses the same importer as the plugin, rather than reconstructing the design itself.

This is a documented integration path, not a verified end-to-end feature yet.
Studio MCP execution contexts vary: HTTP access, Studio user identity, asset upload
permissions and ChangeHistoryService recording must be tested in the chosen client.
The local plugin remains the supported alpha import interface.

### Observed bundled Studio MCP limitation

On 9 October 2026, a connected Studio in edit mode successfully executed Luau,
queried Studio user identity and created/destroyed a temporary EditableImage.
However, `ChangeHistoryService:TryBeginRecording` returned no recording, and
`InsertService:LoadLocalAsset` was rejected for missing RobloxScript capability.
The guarded import recipe below therefore cannot proceed in that tested context.
Use the local plugin panel for imports until a plugin-side execution bridge is
implemented and verified. MCP can still inspect the imported instance tree.
This check did not upload images or modify game objects.

## Local CLI clients on Windows

Both Codex CLI and Claude Code can connect to a local stdio MCP server. Studio
must remain open and have its MCP connection enabled. With a checkout at
`D:/figlo`, register Studio's bundled MCP executable using the launcher:

```sh
codex mcp add roblox-studio -- powershell.exe -NoProfile -NonInteractive -File D:/figlo/tools/studio_mcp.ps1
claude mcp add --transport stdio roblox-studio -- powershell.exe -NoProfile -NonInteractive -File D:/figlo/tools/studio_mcp.ps1
```

Replace the checkout path with your own. Register only the client you use, and
skip registration if a working Studio MCP is already configured. Restart the
client session and ask it to list connected Studios before importing. The
launcher finds the installed Studio MCP through Studio's Windows registry entry;
it is Windows-specific. See the official
[Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

The browser is optional on the Studio side. Figma extraction still requires
access to the Figma document: the supported alpha path is its development plugin.
The optional console driver needs a Figma editor session that actually exposes
the `figma` global. Headless Chrome is not a tested install/export path and cannot
create that API merely by opening the page. Figma's supported Plugin API runs
inside its editor's plugin sandbox; see
[How plugins run](https://developers.figma.com/docs/plugins/how-plugins-run/).

## Prepare a place

1. Install Figlo and export a frame as described in [installation](install.md).
2. Connect the model's Studio MCP to the intended place and remain in edit mode.
3. Sync `studio/src` into `ServerStorage.FigloModules` with Rojo or Argon. Preserve
   the folder structure, including `Runtime/Effects` and the `Client` LocalScript.
   Do not rewrite ModuleScript Source through MCP when workspace sources exist.
4. For an isolated test, build the included test place with
   `rojo build tools/verification.project.json -o build/FigloVerification.rbxl`,
   open it in Studio, and connect that instance. This place contains the modules;
   it has no imported UI until an import is performed.

## Invoke the importer

Use this template with an actual export code and the private relay token. Pass
the token privately for the current session; never commit it or include it in
issue reports. Giving it to an external model may put it in that client's history.

```lua
assert(not game:GetService("RunService"):IsRunning(), "Import in edit mode")
local modules = game.ServerStorage:FindFirstChild("FigloModules")
assert(modules, "Sync Figlo modules from the workspace first")
local fresh = modules:Clone() -- fresh require cache after source synchronization
fresh.Parent = game.ServerStorage
local ok, result = pcall(function()
    local importer = require(fresh.Importer)
    local action = require(fresh.ImportAction)
    local gui, warnings = action.run(game:GetService("ChangeHistoryService"), function()
        return importer.run("ABCDEF", {
            token = "<private pairing token>",
            parent = game.StarterGui,
            runtime = fresh.Runtime,
            client = fresh.Client,
        })
    end)
    return { path = gui:GetFullName(), warnings = warnings }
end)
fresh:Destroy()
if not ok then error(result) end
return result
```

The wrapper requires an Undo recording before importing. If the execution context
cannot record or upload images, stop and use the Figlo plugin panel; do not bypass
the check. Asset uploads remain on Roblox even if place edits are undone.

A useful request to the model is: "Check the connected Studio instance and edit
mode. Import this Figlo export with the synced modules and Undo wrapper, report
warnings, then inspect the generated StarterGui. Do not modify module Source."

After import, inspect the UI in Play and on different screen sizes, and save the
place. Figma selection/export still uses the Figma plugin. This integration does
not give Studio MCP access to Figma or promise identical rendering.
