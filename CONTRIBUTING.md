# Contributing

Install Bun 1.3.10 and Rokit 1.2.0, then run `rokit install`. There are no npm
dependencies. Run `bun run check` before proposing a change and `bun run build`
after changing plugin code.

Edit `figma/extract.js` and `figma/plugin/main.js`; regenerate the checked-in
`figma/plugin/code.js` using `bun tools/build_figma.ts`. Edit Studio scripts in
`studio/src`, then sync or build through Rojo/Argon. Do not maintain a second
source copy edited only in Studio.

Bug reports should include tool versions, a minimal original frame, expected
behavior and import warnings. Remove private design content and tokens. Include
before/after screenshots for layout changes, with viewport dimensions. Add a
regression test for changes to conversion, relay validation or re-import.

Headless importer tests use the actual modules with fake external services.
Changes to font fitting or effects also need the Studio/Figma checks described
in `docs/release.md`. Lune cannot test engine rendering or upload permissions.

Keep IR version 1, `FF_*` attributes and existing imported object names compatible
unless a migration is documented. Security changes must update every relay client.

Contributions are accepted under this project's MIT license. Submit only code,
designs and test fixtures you have permission to distribute.
