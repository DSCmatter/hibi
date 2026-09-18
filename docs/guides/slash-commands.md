# Slash commands

Slash commands insert common blocks without leaving the keyboard. The plugin is enabled by default; turn it on or off under **Settings → Addons**.

## Insert a block

1. Start a paragraph or source line with `/`.
2. Type a command or keyword, such as `/h2`, `/todo`, or `/table`.
3. Use Up/Down Arrow to choose a result, then Enter or Tab to apply it. You can also click a result.

Escape or an outside click closes the menu and leaves your text unchanged.

Available blocks include paragraphs, headings 1–3, bullet and numbered lists, checklists, quotes, code blocks, dividers, and tables. In formatted text, a command changes the current block; in source view, it inserts Markdown. Undo restores the previous block.

## Plugin actions

Enabled plugins can add commands. For example, Frontmatter adds `/frontmatter`, also found with `/properties`, `/metadata`, or `/yaml`, when the note has no page properties.

Actions that change a whole note can reset undo history in the formatted editor. Source-view undo remains available.

## Where it works

Slash commands work in Markdown's normal, source, and side-by-side views. They do not open inside code, inline code, or frontmatter. Slashes in URLs and file paths remain ordinary text.

With Vim enabled, use insert mode. `/` keeps its search meaning in Vim normal mode. Disabling Slash commands leaves your note and undo history intact.
