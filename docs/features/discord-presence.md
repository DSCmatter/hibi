# Discord Rich Presence

Enable **Discord Rich Presence** in **Settings → Addons** to show that you are using Hibi in the Discord desktop app. It is disabled by default.

Hibi's application ID, `1550610632137637958`, is configured by default. You do not need a bot token, client secret, or password. Keep Discord's desktop app running and enable activity sharing there; the browser client does not provide the required connection. To use another application, create one in the [Discord Developer Portal](https://discord.com/developers/applications) and enter its ID in the addon's settings.

The default activity is **Writing in Hibi**, with an optional elapsed timer. **Show document name** is off by default. Turning it on publishes only the active filename; document text, folder paths, and workspace names are never shared. Turn it off to remove the filename immediately.

Hibi checks for changes every 15 seconds and reconnects automatically. Disabling the addon, clearing its application ID, or closing Hibi's windows clears the activity. If the renderer crashes or stops responding, the activity expires within 45 seconds.

Open the addon's README from its row in **Settings → Addons** for platform requirements and troubleshooting.
