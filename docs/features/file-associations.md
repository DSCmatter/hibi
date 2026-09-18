# Open files with Hibi

Use your operating system's **Open with** menu to choose Hibi for a document. On macOS, you can also drop a file onto Hibi's Dock icon. Files opened while Hibi is starting wait until the editor is ready.

Opening an already-open file selects its tab. Single-file mode asks what to do with unsaved work before replacing the current note. Unsupported formats and unreadable files show a notice. Opening a file does not run its embedded code.

## Make Hibi the default

Open **Settings → Formats**. Each enabled built-in format offers **Make default**, or **Choose default…** on Windows. The action applies to every extension listed for that format. Markdown and plain text are always listed.

Disabling a plugin does not undo your operating system's default choice. Its files still open as source text in Hibi.

### macOS

Move Hibi to Applications, then choose **Make default** in its format settings.

You can also select a file in Finder, open **Get Info**, and choose **Open with → Hibi → Change All**. See [Apple's guide](https://support.apple.com/guide/mac-help/choose-an-app-to-open-a-file-on-mac-mh35597/mac) for details.

### Windows

Install Hibi with its Windows installer. It becomes available in **Open with** without replacing your existing defaults.

Choose **Choose default…** in Hibi to open Windows Default apps. Select Hibi for the listed extensions. Windows requires you to make this choice in its settings.

### Linux

Keep the AppImage in a permanent location, then choose **Make default**. Hibi registers its launcher and document types for your user account. This needs `xdg-utils`, `shared-mime-info`, and `desktop-file-utils`.

Linux desktops can group extensions by file type, so aliases such as `.html` and `.htm` share a default. If you move the AppImage, repeat the action from its new location. Your desktop's AppImage integration tools may also add Hibi to **Open with** without making it the default.

## Other builds and plugins

Development and preview builds can open files but do not change system defaults. Formats added by third-party plugins can be opened inside Hibi, but Hibi does not register them with the operating system automatically.
