# Media and navigation

## Files and folders

Drop a supported document file onto Hibi to open it, or drop a folder to open a workspace. The same unsaved-change checks apply as when opening from the File menu.

Drag sidebar items onto a folder to move them there. Drop onto blank sidebar space to move to the workspace root; dropping onto a file targets its parent folder. Existing destinations are never overwritten. Use **Move to** in an item's menu to choose a destination with the keyboard.

## Attachments

Use the image toolbar button to choose an image or video, or drop one into an editor pane. Hibi inserts it at the drop position. An untitled note asks you to save first; canceling leaves the note unchanged.

Attachments are copied to an `assets` folder beside the note. Originals stay where they are, and duplicate filenames receive a number. Markdown stores a relative reference such as `![description](assets/image.png)`. Move the note and its assets together to keep the attachment working. Edit the description in source view to provide useful text for screen readers and missing images.

### Supported media

- Images: PNG, JPEG, GIF, WebP, AVIF, and SVG, up to 8 MiB each.
- Videos: MP4, MOV, WebM, and OGG/Theora, up to 512 MiB each. Playback depends on the video codec. Formatted views provide playback controls and seeking.

Missing or unsupported media shows its description. Hibi does not automatically download remote media. SVGs display as images, not executable pages.

[Documentation exports](../guides/exporting.md) embed local media within a 20 MiB total export limit. Share large videos separately.

### Local paths

Relative paths resolve from the saved note's folder. Absolute paths and local `file:` URLs also work. For spaces in Markdown paths, use percent encoding or angle brackets.

Website-style paths such as `![Screenshot](/uploads/screenshot.png)` first look for an absolute file. If none exists, Hibi checks `uploads` and `public/uploads` inside the workspace, or beside the note when no workspace is open. The path in your source stays unchanged.

## Links and history

Shift-click a link to follow it. Web and email links open in your default app; local note links open in Hibi. Regular clicks keep editing. Heading links jump to the matching section in the formatted document.

Use `Cmd/Ctrl+[` to go back and `Cmd/Ctrl+]` to go forward through opened notes. While Settings is open, these shortcuts navigate settings pages instead. History lasts for the current app session. Hibi checks unsaved edits before replacing a note and reloads clean saved files from disk when you return to them.

Escape closes Settings. If a dialog is open, it closes that dialog first.

## Open remote Markdown

Choose **File → Open from remote…** and enter a raw HTTP or HTTPS Markdown URL. Hibi opens the downloaded text as an editable draft. Save it locally to keep it; Hibi never writes back to the server.

The download must be UTF-8 text under 2 MiB. Webpage HTML, embedded credentials, and non-web addresses are rejected. Requests stop after 20 seconds or more than five redirects. Relative attachment paths need matching local assets after you save.

## Continue after a formatted block

To type after a final table, code block, list, or other formatted block, press `Cmd/Ctrl+Enter`, press Down Arrow at its final cursor position, or click the blank editor area below it. Hibi adds a paragraph when you request one; opening the note alone leaves its source unchanged.
