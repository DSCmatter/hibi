# Editing

Start typing in a blank note, or use **File → Open** to choose a document. The welcome screen also lists recent workspaces. Typing, changing views, or choosing **Dismiss** hides it.

## Choose a view

- **Normal** lets you write and format text without seeing Markdown markers.
- **Side-by-side** shows source on the left and the formatted document on the right. Markdown supports editing in either pane; other formats may offer a preview instead.
- **Source view** shows the original text and syntax highlighting.

Only views supported by the current [format](../editing/formats.md) are available. Plain text uses source view. **Settings → Editor → Layout → Default view** sets the view for new launches. Switching views from the toolbar leaves that default unchanged.

Default view shortcuts are `Cmd/Ctrl+Shift+[` for Normal, `Cmd/Ctrl+Shift+]` for Source view, and `Cmd/Ctrl+Shift+\` for Side-by-side. Change them in **Settings → Hotkeys**.

Switching views preserves the source. Editing formatted text may change Markdown spacing or notation. When Hibi cannot preserve a construct through visual editing, the formatted pane becomes read-only; use source view to edit it. This includes raw HTML, reference definitions, and frontmatter when its plugin is disabled.

## Work with tabs

Opening or creating a note adds a tab. Select a tab to return to its document. A dot marks unsaved changes; `Cmd/Ctrl+W` closes the active tab. Hibi asks before discarding unsaved work, including when you close the window.

Drag tabs to reorder them. With a tab focused, use arrow keys or Home/End to move between tabs, and `Alt+Shift+Left/Right` to reorder. Tabs scroll horizontally when they no longer fit.

To keep one file open at a time, turn off **Settings → Editor → Documents → Use tabs**. Hibi keeps the active note and asks what to do with other unsaved tabs. Single-file mode still shows the filename and unsaved indicator. Turning tabs back on does not reopen notes you closed.

Open tabs survive an editor reload during the current app session. They are not restored after quitting Hibi.

## Format text

Select text, then choose a toolbar action. In side-by-side view, actions apply to the pane you last used. Tools change to match the document format; unavailable tools are hidden or disabled. The **More** menu holds buttons that do not fit.

Markdown tools include headings, emphasis, lists, quotes, code, links, images, and tables. Within a formatted table, extra buttons add or remove rows and columns. In source view, insert a table and edit its text directly.

Link and image dialogs let you enter an address and label. Images can use local paths relative to a saved note. See [images and attachments](../editing/media-and-navigation.md#attachments) for supported types and limits.

Under **Settings → Appearance → Toolbar**, choose icons, text, or both; hide the toolbar; or arrange its buttons. Drag buttons directly, or use the up/down controls in **Arrange toolbar actions**. **Hide toolbar while typing** reveals it again when you pause or move the pointer to the top of the window.

In side-by-side view, scrolling keeps the corresponding passages together. A faint caret in the other pane shows your current position without moving keyboard focus.

## Find text and commands

Press `Cmd/Ctrl+F` to find text in the note. Search ignores case and treats your query as plain text. Enter moves to the next match; Shift+Enter moves back; Escape closes search. Side-by-side view searches the pane you last used, including text outside the visible area.

Press `Cmd/Ctrl+K` to search commands and settings. Use arrow keys and Enter to choose a result. Press Escape or click outside to close the palette.

## Save and rename

Use **File → Save** (`Cmd/Ctrl+S`) or **Save as** (`Cmd/Ctrl+Shift+S`). New notes need a location before [autosave](settings.md#autosave) can work. If another app changes a file, Hibi asks before replacing it.

To rename a note, run **Rename document…** from the command palette or choose **Rename** in its workspace menu. Enter applies the name; Escape cancels. Renaming keeps unsaved edits and does not replace another file. For an unsaved note, it sets the suggested name for the first save.

Files must use UTF-8 and be no larger than 2 MiB. Unsaved drafts live in memory: an editor reload can recover them, but a full app or machine crash can lose them. [Version history](../editing/version-history.md) stores previous saves.

## Optional writing tools

Enable plugins under **Settings → Addons**:

- **Word count** shows word and character totals. Markdown counts exclude formatting markers and frontmatter; other formats count source text. Joined emoji count as single characters.
- **Block dragging** adds a grip beside formatted text blocks. Drag it to move paragraphs, headings, lists, or nested list items. Click it for **Move block up/down**, also available in the command palette. Moves support undo and redo.
- **Frontmatter** adds editable [page properties](frontmatter.md) above a Markdown note.

Word count and Block dragging are off by default. **Settings → Editor → Writing → Spell check** controls spelling underlines in formatted text. Source editing keeps spell check off.

See [settings](settings.md) for line numbers, cursor appearance, page padding, and other preferences.
