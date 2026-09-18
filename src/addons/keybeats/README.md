# keyBeats for Hibi

Play mechanical keyboard sounds while writing. Turn on **keyBeats** in **Settings → Addons**, then open its settings to choose from 13 keyboard profiles, adjust volume, or mute. The plugin is off by default.

The toolbar button toggles mute. Hiding the toolbar does not turn the sounds off. Sounds work in normal and source views, including side-by-side editing.

Only typing in the editor makes sounds. Settings, search, properties, dialogs, command shortcuts, automatic key repeats, and text-composition events stay silent. The plugin does not monitor the system keyboard, store keystrokes, or send them anywhere.

Sounds load in the background, so the first keystrokes may be silent. Only the selected profile loads. Muting, changing profiles, leaving the window, or turning the plugin off stops sounds already playing. Audio setup does not record sound or ask for microphone access.

## Credits

Ported by **may** (Discord `1262793452236570667`) from [keyBeats by Yug Bhanushali](https://github.com/YugBhanushali/keyBeats), revision `570f9c84866be4aad100d3acac29990fba5c657a`. Keyboard recordings come from [kbsim by Thomas Lai](https://github.com/tplai/kbsim), revision `ba103f3b0afa9dab80447aa2e7e2ed80b6bd80e4`.

Both projects use MIT licenses. Their original notices are in [LICENSE.keybeats.md](LICENSE.keybeats.md) and [LICENSE.kbsim.md](LICENSE.kbsim.md), and in Hibi's **Open source licenses**. The port includes 150 recordings and the original profile mappings. Unused recordings are omitted; missing MX Blue special-key sounds use the original generic fallback.
