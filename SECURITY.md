# Security

This alpha supports a relay running on the user's computer, bound only to
`127.0.0.1` and `::1`. Public hosting and tunneling are unsupported. Do not
place tokens in URLs, source files, screenshots or issue reports.

The relay uses a random pairing token, restricted browser origins, loopback-host
validation, bounded payloads/cache/storage, schema checks and seven-day retention.
Opaque Figma plugin iframe origins are accepted only with the token. The token
does not protect against a compromised OS account or untrusted local processes
that can read terminal output or relay files. It is not stored by the plugins.

Design exports contain text, node identifiers and image pixels in
`relay/.sessions/`. Keep that directory private; it is excluded from Git and
release packages. Windows directory access follows the user's filesystem ACLs.
Exports are not encrypted at rest. Authorized deletion is available through
`DELETE /exports/<code>`. Expired exports are checked on reads and every minute;
after shutdown they are cleaned up at the next startup.

Roblox asset creation and moderation are external operations. Canceling an
import or undoing place changes does not delete assets already uploaded.

Report a vulnerability privately through
[GitHub's private vulnerability reporting](https://github.com/astrorehan/figlo/security/advisories/new).
Do not post exploit details in a public issue, and do not attach tokens, private
exports or account cookies to any report.
