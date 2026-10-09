# Alpha release verification

Version: `0.1.0-alpha.1`. The source tree and release artifacts are prepared
locally; no remote repository or public marketplace listing is configured.

## Automated checks

`bun run check` must pass from a fresh checkout. It runs extractor and relay tests,
the Crisp image-resampling assertions, the shipping builder/importer behavior
checks under Lune, compilation of every Studio Luau module, generated-plugin
freshness, original-demo freshness, branding and common credential-pattern scans.

Relay tests cover pairing, untrusted origins and rebound hosts, source access,
binary round trips, invalid dimensions/header/schema/tree depth, duplicate keys,
truncated/trailing data, chunked request limits, restart persistence, disk quotas,
access-time expiration, periodic cleanup and explicit deletion.

Importer tests construct actual Lune Roblox instances with injected external
services. They check native text/buttons, geometry, three successive re-imports,
Studio placement/effect overrides, original-value snapshots, backups, hidden
additional pages, custom siblings, image cache dimensions/owners, successful
reuse, failed pixel writes, upload retries/cleanup, invalid IR rejection and
Undo commit/cancel selection. They do not simulate Roblox's renderer, real HTTP
permissions, account asset permissions, asset moderation or Undo engine internals.

`bun run build` creates the Figma development plugin, Studio `.rbxm`, and optional
browser driver. `bun run package` also creates explicit plugin/source archives and
SHA-256 checksums. Packaging only includes tracked sources and allowlisted build
artifacts, excluding sessions, backups and personal working exports.

CI is configured for Windows and Linux with pinned action revisions, Bun, Rokit,
Rojo and Lune. Local checks do not constitute a GitHub Actions run. The maintainer
must verify both CI jobs after pushing the repository to its chosen host.

## Interactive release gate

Use an isolated place; do not test destructive failure cases in a production game.

1. Install the built Figlo plugin in Studio and its manifest in Figma desktop.
2. Start the relay; pair both plugins using the printed token. Confirm a missing
   or wrong token cannot export/import and a valid token can.
3. Create the original demo through the Figma plugin, export it and import it.
   Compare text baselines, colors, corners and proportions at desktop and mobile
   viewport sizes. In Play, check `_pulse` and `_smooth` and page navigation.
4. Change root size, visibility and a hover parameter in Studio; re-import twice.
   Confirm overrides survive, untouched Figma updates arrive and Undo restores
   the prior roots. Try a second page and a custom sibling.
5. Export original art needing rasterization. Confirm the configured account/group
   owns the uploads and the target experience can access them after moderation.
   Re-import to verify cache reuse. Test a controlled failed import and Undo.
6. Restart the relay, re-pair with the new token, import a saved code, then delete
   that export and verify it is unavailable. Do not record tokens in screenshots.

`tools/verification.project.json` builds a separate local place with the shipping
modules. `rojo build tools/verification.project.json -o build/FigloVerification.rbxl`
creates it without changing the game workspace or editing Studio script sources.

## Verification record, 9 October 2026

Local extractor/relay tests, Crisp assertions, importer behavioral checks, Luau
compilation, release scans and plugin builds passed during preparation.
The real-process relay check also passed: authenticated gzip CLI push, HTTP
round trip, untrusted-origin rejection and explicit deletion over local sockets.
All checks and builds also passed in a separate, fresh local Git checkout.
The release source ZIP was compared byte-for-byte against its recorded commit;
the archives and Git history contained no retired branding. SHA-256 checksums
were verified for each distributable. Model inspection checks the compiled
Studio plugin's module inventory and embedded script sources.

Interactive Figma/Studio checks are **pending**. The Studio connector returned
no connected instances, and the desktop/browser automation helpers failed to
initialize. `docs/demo.svg` is a design preview, not a screenshot or proof of
Studio visual parity. This alpha is not described as visually verified or as
approved for either platform's marketplace.

Before publishing: complete the interactive gate, inspect the source archive,
run hosted CI, enable private vulnerability reporting and choose the repository
URL. Publish only the files in `build/release/0.1.0-alpha.1` after verifying the
SHA-256 manifest. Retain a release tag pointing at the verified source commit.
