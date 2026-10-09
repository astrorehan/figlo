# Figlo 0.1.0-alpha.1

Figlo imports a selected Figma frame into Roblox Studio as editable UI. Native
text, shapes and supported layouts remain editable; other artwork is uploaded
as images. Layer tags add button feedback, page navigation and animation.

This first alpha ships local development plugins for Figma and Studio, a Bun
relay, an original demo, and the complete MIT-licensed source. It is an
independent project, not affiliated with or endorsed by either platform.

## Included

- A paired, loopback-only relay with token authentication, origin/host checks,
  validated exports, storage limits, seven-day expiration and explicit deletion.
- Re-import that keeps Studio placement and effect overrides across repeated
  imports, plus backups and shared-runtime pages.
- Image upload caching partitioned by source/target dimensions and asset owner,
  retry cleanup, and Undo cancellation for failed plugin imports.
- Reproducible plugin/source packaging, SHA-256 checksums, pinned tools and CI
  configuration for Windows and Linux.
- An original five-color Figlo icon, a download/install guide and an experimental
  Studio MCP integration recipe using the shipping Luau API.

## Install

Download the Figma plugin ZIP and the Studio `.rbxm` from the release assets.
Import the extracted Figma `manifest.json` as a development plugin, and install
the Studio model in the local Plugins folder. The source ZIP includes the relay;
install Bun 1.3.10, run `bun run relay`, and enter its pairing token in both
plugins. Export one frame, then import its six-character code in Studio.

The source archive records the source commit in `REVISION.txt`. Verify downloads
against `SHA256SUMS.txt`. Keep the included MIT license when redistributing.

## Alpha verification and limits

Thirty-one extractor/relay tests pass, along with Crisp resampling assertions,
shipping builder/importer behavior checks, a real HTTP/CLI relay check, Luau
compilation and compiled-plugin source inspection. The checks and builds also
pass from a fresh local checkout.

Interactive Figma/Studio rendering, real account/group uploads, moderation and
Undo engine behavior remain pending. Hosted CI has not run before publication.
This release does not promise pixel-identical rendering or marketplace approval.
Check font fallback, masks and desktop/mobile layouts in your own place. Audio
is silent by default; supply assets your experience can use.

See `docs/install.md`, `docs/studio-mcp.md`, `README.md`, `docs/compatibility.md`, `docs/troubleshooting.md` and
`docs/release.md` in the source archive for setup, limitations and the remaining
interactive verification steps. Keep pairing tokens and private designs out of
public issue reports.
