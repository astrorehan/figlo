# Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot fetch export / HTTP 401 | Paste the current relay token into both plugins. Restarting the relay rotates it unless `FIGLO_TOKEN` was supplied. |
| Relay not running | Start `bun run relay`; port 34880 must be free. Keep the terminal open. Check local network permissions/firewall. |
| Unknown or expired code | Exports expire seven days after creation. Export again. Use the same session directory after restarting. |
| Storage quota reached | Delete unneeded exports with the authenticated deletion endpoint, or wait for expiry. Limits do not silently overwrite active exports. |
| Asset upload/allocation fails | Check Studio's asset API permissions, account/group ownership, EditableImage support, allocation limits and rate limits. Retry later; uploads may already exist. |
| Images are blank | New assets may be under moderation. Existing assets can also be inaccessible to the experience. Verify ownership/permissions and moderation in Creator Dashboard; waiting alone does not fix every failure. |
| Text differs from Figma | Check font availability, fallback warnings, viewport size and text wrapping. See compatibility limits. |
| Old code runs after source sync | Studio caches `require`. Require a fresh clone of the complete module Folder. |
| Import as page does nothing | Select the imported ScreenGui, not its root Frame. |
| Cannot start Undo recording | Finish the other plugin operation or recording, then retry. No import is started without an Undo recording. |
| Button is silent | Default audio is off. Set an audio ID your experience has permission to use in Effects. |
| Browser-console export fails | Use the Figma desktop development plugin. The optional browser path depends on an available `figma` global and browser clipboard permissions. |

Never paste pairing tokens or private exports into issue reports. Include tool
versions, sanitized warnings and a minimal frame you own instead.
