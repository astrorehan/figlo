# Changelog

## Unreleased

- Add a searchable Tag Guide to the Figma plugin, with interactive previews,
  adjustable settings and an action to apply tags to selected layers.
- Simulate the selected UI tree using each child's own tags and stored settings,
  including button states, navigation, scrolling and combined effects.
- Add a maximized preview with a faint dotted background and an Escape shortcut
  to return to the guide. Preserve the scene while resizing.
- Include structural tags and baking aliases in the guide and selection state.
- Preserve gradients and the full text artwork in the Figma preview, including
  outlines and text that extends beyond its layout box.

## 0.1.0-alpha.1

- Rename the plugins and new imports to Figlo; retain existing import identifiers
  and runtime/client object names during re-import.
- Add relay pairing, restricted origins and host validation, payload validation,
  bounded storage/cache, seven-day expiration and explicit export deletion.
- Keep Studio overrides across repeated imports by snapshotting original values.
- Partition image cache keys by source/target dimensions and asset owner.
- Dispose temporary editable images on upload and pixel-write failures.
- Cancel failed plugin imports through Undo and handle unavailable recordings.
- Provide an original asset-free demo; make default button audio silent.
- Add MIT licensing, contributor/security documentation, reproducible release
  packaging and Windows/Linux CI checks.
