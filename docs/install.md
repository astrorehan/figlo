# Install Figlo alpha

Download from [GitHub Releases](https://github.com/astrorehan/figlo/releases).
Figlo is currently installed as local development plugins. It is not yet listed
in Figma Community or Roblox Creator Store.

## 1. Start the relay

Install [Bun 1.3.10](https://bun.sh). Download and extract the source ZIP, open
a terminal in its folder, and run:

```sh
bun run relay
```

Keep this terminal running. It displays a private pairing token. The relay needs
no dependency install. The Figma and Studio plugins must run on this computer.

## 2. Install the Figma plugin

Download and extract `Figlo-0.1.0-alpha.1-figma.zip`. In Figma desktop choose
**Plugins > Development > Import plugin from manifest**, and select the extracted
`manifest.json`. Run **Figlo**, then paste the relay's pairing token in its panel.

## 3. Install the Studio plugin

Download `Figlo-0.1.0-alpha.1-studio.rbxm`. Copy it into Studio's local Plugins
folder and restart Studio. Studio's **Plugins Folder** command opens the folder;
the usual locations are `%LOCALAPPDATA%/Roblox/Plugins` on Windows and
`~/Documents/Roblox/Plugins` on macOS.

Open a place, enable **Allow HTTP Requests**, open Figlo from the Plugins toolbar,
and paste the same token. Grant the HTTP/script permissions the plugin requests.
Image imports also require an account with the relevant asset API permissions.

## 4. Try an import

In Figma, choose **Create demo frame**, select it, and press **Export to Roblox**.
Copy the six-character export code into Studio's Figlo panel and choose **Import**.
Find the result under `StarterGui`. Play to check it, then save the place.

Restarting the relay normally changes the token, so pair both plugins again.
The export code is separate from that token. Never put the token in public issues.

## Source builds and model access

To build the plugins yourself, also install Rokit 1.2.0, then run `rokit install`
and `bun run build`. See [AI import](studio-mcp.md) for the browser export script
and importer calls through an existing Studio connection.

See [troubleshooting](troubleshooting.md) if fonts, images or permissions fail.
