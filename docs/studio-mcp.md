# Import with AI

Figlo's browser export script and Luau importer can be called by an AI client.
The client needs access to the Figma editor, local shell commands and Studio MCP.
Once those are connected, it can handle the export code itself and call the
importer without using the plugin buttons.

The browser-to-Studio workflow was used with the earlier FrameFig version.
When updating that automation, include the current relay's pairing token.

## Set up once

- Sign in to Figma and open the design in an editor session. The browser tool
  must be able to execute JavaScript there and access the `figma` global.
- Connect Studio MCP to the intended place and stay in edit mode.
- Sync `studio/src` into `ServerStorage.FigloModules` with Rojo or Argon.
  Keep `Runtime/Effects` and the `Client` LocalScript in their original structure.
- Run `bun run relay`. Give the local shell caller the same private `FIGLO_TOKEN`
  used by the relay. Enable the place's HTTP requests and the asset permissions
  needed for image uploads.

A local CLI client can use this setup. Add Studio's bundled MCP as a local stdio
server using `powershell.exe` with these arguments on Windows:

```json
["-NoProfile", "-NonInteractive", "-File", "D:/figlo/tools/studio_mcp.ps1"]
```

Replace the checkout path. The launcher finds Studio's installed MCP executable
through its Windows registry entry. It was added after 0.1.0-alpha.1, so use a
repository checkout rather than that release's source ZIP. Skip this if your
client already has a working Studio connection. Browser tools are configured
separately.

## Export the frame

1. Build the browser script with `bun tools/build_page.ts`, or download
   `Figlo-<version>-web.js` from the release.
2. Execute `out/figlo-page.min.js` (or the downloaded file) in the Figma editor
   through the browser tool.
3. Run `await window.__ffrun("<node ID>")`. Use Figma's actual node ID, such as
   `123:456`.
4. Read `window.__ffstatus`. Continue only when `done` is true and `error` is empty.
5. Save `window.__ffb64` to a local export file. It contains the packed export,
   including image pixels, prefixed with `FFGZ:`.
6. Send it to the relay from the shell:

```sh
# FIGLO_TOKEN must already be set privately for this process.
bun tools/push_clipboard.ts /path/to/export.txt
```

Despite its name, this command reads the supplied file without using the
clipboard. It prints the six-character export code; the client uses that code
in the next step. Keep private design exports out of the repository.

This script depends on an editor session exposing the `figma` global. If it
isn't available, that browser route cannot export the document. Headless Chrome
hasn't been tested. See [Figma's plugin environment](https://developers.figma.com/docs/plugins/how-plugins-run/).

## Import in Studio

Use Studio MCP's Luau execution tool in edit mode. Pass the export code and
private pairing token to the importer. Do not write module Source through MCP;
keep source changes in workspace files and sync them.

For imports that may exceed the tool's time limit, start a background import:

```lua
assert(not game:GetService("RunService"):IsRunning(), "Import in edit mode")
local modules = game.ServerStorage:FindFirstChild("FigloModules")
assert(modules, "Sync Figlo modules first")
local session = modules:Clone() -- fresh require cache after syncing
session.Name = "FigloSession_" .. game:GetService("HttpService"):GenerateGUID(false)
session.Parent = game.ServerStorage

require(session.Importer).start("ABCDEF", {
    token = "<private pairing token>",
    parent = game.StarterGui,
    runtime = session.Runtime,
    client = session.Client,
    status = session,
})
return session:GetFullName()
```

Keep the returned session path. Poll that folder's `FigloStatus` and `FigloLog`
through Studio MCP. A status of `done` means the importer finished;
`failed: ...` reports an error. Read `FigloResult` for the imported container
path and `FigloWarnings` for warnings. Do not report success while it is running.
Destroy the temporary session folder only after the background import has ended.

`Importer.run(code, opts)` is also available for a synchronous call.
See [API options](api.md) for group ownership, cache reuse and page imports.

Direct importer calls do not create an Undo recording. The plugin panel uses
`ImportAction` to record and cancel failed place edits. Use that wrapper only
where recording is available; it is not a prerequisite of `Importer.run` or
`Importer.start`. Uploaded images are not reversed by Undo.

## Check the result

Inspect the path returned in `FigloResult`, read the warnings, and check the UI
in Play at the intended screen sizes. An import completing does not guarantee
that fonts, images or layout render exactly like Figma. Save the place to retain
the imported objects.

## What was checked here

On 9 October 2026, the connected Studio MCP executed Luau, read Studio user
identity and created/destroyed a temporary EditableImage. It could not start an
Undo recording or load a local model with `LoadLocalAsset`. Those results limit
the optional wrapper and file-loading method; they do not establish that direct
import is unavailable. An end-to-end browser export and direct import of the
current secured alpha has not been repeated in this session.
