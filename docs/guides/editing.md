# Editing

Start typing in a blank note, use **File → Open** to choose a document, or select a recent workspace from the welcome screen.

## Choose a view

**Normal** lets you format text without seeing Markdown markers. **Source view** shows the original text with syntax highlighting. **Side-by-side** places them next to each other; Markdown supports editing in either pane, while other formats may offer a preview instead.

Choose your starting view under **Settings → Editor → Layout → Default view**. Only views supported by the current [format](../editing/formats.md) are available. You can switch from the toolbar or use a [keyboard shortcut](../editing/typing-and-shortcuts.md).

Switching views preserves your source. Editing formatted text may change Markdown spacing or notation. If Hibi cannot preserve part of a document through visual editing, that pane becomes read-only; use source view to edit it.

## Work with tabs

Opening or creating a note adds a tab. Select one to return to its document, drag it to change its position, or press `Cmd/Ctrl+W` to close it. A dot marks unsaved changes. Hibi asks before discarding unsaved work.

With a tab focused, arrow keys and Home/End move between tabs. Use `Alt+Shift+Left/Right` to reorder them with the keyboard.

To keep one file open at a time, turn off **Settings → Editor → Documents → Use tabs**. Hibi keeps the active note and asks what to do with other unsaved tabs. Turning tabs back on does not reopen closed notes. Open tabs are not restored after quitting Hibi.

## Format text

Select text, then choose a toolbar action. In side-by-side view, actions apply to the pane you last used. The toolbar offers tools for the current format, with extra buttons in the **More** menu. Within a formatted table, additional actions let you add or remove rows and columns.

Under **Settings → Appearance → Toolbar**, choose how buttons appear and arrange their order. Drag buttons directly, or use the up/down controls in **Arrange toolbar actions**. If the toolbar hides while typing, pause or move the pointer to the top of the window to reveal it.

See [images and attachments](../editing/media-and-navigation.md#attachments) for adding media to your notes.

## Find text and commands

Press `Cmd/Ctrl+F` to find text in the document. Enter moves to the next match, Shift+Enter moves back, and Escape closes search. In side-by-side view, search uses the pane you last edited.

Press `Cmd/Ctrl+K` to search commands and settings. Use arrow keys and Enter to choose a result, or Escape to close the palette.

## Save and rename

Use **File → Save** (`Cmd/Ctrl+S`) or **Save as** (`Cmd/Ctrl+Shift+S`). New notes need a location before [autosave](settings.md#autosave) can work. If another app changes a file, Hibi asks before replacing it.

To rename a note, run **Rename document…** from the command palette or choose **Rename** in its workspace menu. Renaming keeps unsaved edits and does not replace another file.

Files must use UTF-8 and be no larger than 2 MiB. Save your work regularly: unsaved drafts can be lost in an app or machine crash. [Version history](../editing/version-history.md) stores previous saves.

## Optional writing tools

Under **Settings → Addons**, enable **Word count** for word and character totals, or **Block dragging** to rearrange formatted text using a grip beside each block. The grip also offers **Move block up/down**, and moves support undo.

The **Frontmatter** plugin adds editable [page properties](frontmatter.md). **Settings → Editor → Writing → Spell check** controls spelling underlines in formatted text. See [settings](settings.md) for other preferences.
