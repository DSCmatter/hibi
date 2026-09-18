# Settings

Open Settings from the command palette. Use the sidebar to choose a page, or search below **Back to app** by a setting's name or description. Results include enabled plugins. Select a result to open its page and focus the setting. Escape or the clear button clears the search; Down Arrow moves into the results.

Preferences stay on this device. **Back to app** returns to your document.

## Editor and appearance

**Editor** contains [tabs, default view, and spell check](editing.md), along with autosave and line numbers. **Show line numbers** applies to source and side-by-side views. **Content padding** sets the space around your document from 0–96 pixels; the default is 48.

**Appearance** includes [colorschemes](colorschemes.md), toolbar layout, and top-bar visibility. Cursor settings offer a line, outline block, filled block, or underline, with blink speed and motion choices. Your system's reduced-motion setting disables sliding and blinking animations.

Turn on **Non-input focus outlines** under **Appearance → Focus** for borders around focused buttons, links, and navigation. It is off by default. Text fields keep focus indicators in either mode.

**Lowercase interface** displays app labels, menus, plugin panels, and notifications in lowercase. It leaves documents, typed values, code, and case-sensitive commands unchanged.

## Autosave

Autosave is off by default. Enable it under **Editor** and choose a delay of 1–30 seconds after typing stops. New notes and remote drafts need one manual save to choose a local destination.

The autosave status at the bottom of the window opens these settings. If another app changes the file, autosave pauses. Save manually to review the conflict. Autosave also records [local version history](../editing/version-history.md).

## Keyboard shortcuts

The command palette searches action names and help text. Matches in action names appear first.

Under **Hotkeys**, select a binding and press a new shortcut. Enter saves it; Escape cancels. You can clear individual shortcuts or reset them. Hibi rejects conflicts and reserved editing or window shortcuts. Menus, tooltips, and the command palette show your current bindings.

## Sidebar views

The dropdown beside the sidebar button lists available views. Use its first item to pin or unpin the current view. Up to three pinned views appear first. Shortcuts appear beside the window controls while there is room; the dropdown keeps all views available in narrow windows.

**On this page** groups headings by level and highlights the section containing your cursor. Select a heading to jump to it. See [workspaces](workspaces.md) for sidebar resizing and file navigation.

## Formats, syntax, and code highlighting

**Formats** lists Markdown, plain text, and enabled format plugins. Choose a format's settings button to configure it, or set Hibi as its [default application](../features/file-associations.md).

**Syntax** controls supported formatting features, including heading levels and plugin syntax. **Code highlighting** controls colors for individual programming languages. These settings preserve the original source. Use the filter to find an option; the command palette can also find settings hidden by a page's filter.

## Addons

**Addons** groups plugins and themes into Enabled and Disabled. Search by name, description, type, author, or source. **Reset all** restores the default enabled addons without removing installed packages.

Built-in addons ship with Hibi. Local addons come from folders on your computer, and third-party addons come from a URL. Enable a plugin to show its settings, formats, and syntax options.

### Install an addon

1. Choose **Hibi garden** to browse [available addons](https://hibi.garden/addons).
2. Choose **Install from URL** and enter a public HTTPS Git repository or addon ZIP URL. For a local package, run **Install addon…** in the command palette.
3. Review the package details and trust notice, then install it.
4. Enable the addon when you are ready to use it.

Only install plugins you trust. Enabled plugins can access your documents and workspace through Hibi's APIs. Opening a workspace does not install or run addons found inside it.

Git installation requires Git on your computer. Private repositories, SSH URLs, and packages that need a build are unsupported. Downloaded ZIP files must be under 25 MiB. Installed packages must contain at most 1,000 entries and 25 MiB total, with a 5 MiB limit per file.

**Open plugins folder** shows installed packages. Replacing a package starts the new version disabled; removing one moves it to the system trash.

## Notifications

Under **Appearance → Notifications**, choose where notices appear and when they disappear: after 3, 5, 8, or 10 seconds, or never. **Show preview** tries the current settings. Hovering over a notice or focusing it pauses the timer. Its close button dismisses it immediately.

## If the editor fails

The recovery screen offers **Reload Hibi**, **Save a copy**, and **Error details**. Save a copy exports the draft Hibi still has in memory; it may not include the latest changes. Error details opens a dialog with technical information and a copy button. Hibi does not send this information automatically.

The diagnostics section on the Hibi settings page lets you preview this screen without changing your document.

## App details and licenses

The **Hibi** page shows the app version and creator. **Sponsor on GitHub** opens [may's sponsor page](https://github.com/sponsors/schmayterling).

**Open source licenses** lists included software, colorschemes, and addon notices. Select an entry to read its full text. Notices are included with Hibi and work offline.
