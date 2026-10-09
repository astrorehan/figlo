# Changelog

## 0.1.0-alpha.1

- Rename the plugins and new imports to Figlo; retain existing import identifiers
  and runtime/client object names during re-import.
- Add relay pairing, restricted origins and host validation, payload validation,
  bounded storage/cache, access-time expiration and explicit export deletion.
- Keep Studio overrides across repeated imports by snapshotting original values.
- Partition image cache keys by source/target dimensions and asset owner.
- Dispose temporary editable images on upload and pixel-write failures.
- Cancel failed plugin imports through Undo and handle unavailable recordings.
- Provide an original asset-free demo; make default button audio silent.
- Add MIT licensing, contributor/security documentation, reproducible release
  packaging and Windows/Linux CI checks.
