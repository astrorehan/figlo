# Local relay

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
`FIGLO_PORT` (default 34880), `FIGLO_SESSIONS` (storage directory). Both plugin panels
only connect to port 34880, so changing `FIGLO_PORT` is for CLI and scripted use: set
`FIGLO_RELAY` for `tools/push_clipboard.ts` and the importer's `relay` option to match.
To delete one export early:

```sh
# Set FIGLO_TOKEN privately in your shell first; do not commit it.
curl -X DELETE -H "Authorization: Bearer $FIGLO_TOKEN" http://127.0.0.1:34880/exports/ABCDEF
```

In Windows PowerShell use `Invoke-RestMethod -Method Delete` with the same Authorization
header. The six-character export code selects data; it is not an authentication token.

