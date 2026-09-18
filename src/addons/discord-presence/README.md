# Discord Rich Presence

Show your Hibi activity in the Discord desktop app. This addon is disabled by default.

## Set up

1. Keep the Discord desktop app running and allow activity sharing in Discord's settings.
2. Enable **Discord Rich Presence** in **Settings → Addons**. Hibi's application ID, `1550610632137637958`, is already configured.
3. Open the addon's settings to check the connection or choose what to share.

To use your own Discord application, create one in the [Discord Developer Portal](https://discord.com/developers/applications), copy its **Application ID**, and replace the field in settings. Press Enter or leave the field to apply it. A bot, token, client secret, and account password are not needed.

The addon uses Discord's local desktop IPC sockets on macOS, Windows, and Linux. Discord in a browser is not supported. Sandboxed Discord packages must expose a standard Discord IPC socket to Hibi.

## Choose what to share

By default, the activity says **Writing in Hibi** and includes the session's elapsed time. **Show elapsed time** can hide the timer.

**Show document name** is off by default. Turning it on shares the active filename with people who can see your Discord activity. Document contents, full file paths, and workspace names are never sent. Turning it off clears the filename immediately.

Updates are limited to once every 15 seconds. Hibi reconnects automatically when Discord becomes available. Disabling the addon or closing Hibi's windows clears its activity. A renderer crash or interrupted reload expires the activity after at most 45 seconds without a heartbeat.

If the connection is rejected, check the application ID and Discord's activity settings. Clearing the ID stops the connection while keeping the addon enabled. No package manager or additional CLI is required.

This integration publishes activity only; it does not read messages, join channels, access friends, or use a bot account. It follows Discord's [local IPC protocol](https://discord.com/developers/docs/topics/rpc) and [Rich Presence without authentication](https://discord.com/developers/docs/discord-social-sdk/development-guides/setting-rich-presence).
