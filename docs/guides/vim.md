# Vim editing

Enable **Vim** under **Settings → Addons**. It works in source view and the source pane of side-by-side view. The formatted editor keeps its usual controls.

Hibi uses the [CodeMirror Vim engine](https://github.com/replit/codemirror-vim). It supports normal, insert, replace, and visual modes, including linewise and blockwise selection. Motions, counts, text objects, operators, registers, marks, macros, undo/redo, search, and substitutions are available.

Examples include `ciw`, `d3w`, `"ayy`, `qa…q`, `@a`, `/word`, and `:%s/old/new/g`.

## File commands

| Command | Action |
| --- | --- |
| `:w` | Save. An untitled note opens the save dialog. |
| `:e` | Open the file picker. |
| `:e relative/path.md` | Open a file in the current workspace. |
| `:enew` | Start a new note. |
| `:q` | Close the window. |
| `:wq` or `:x` | Save, then close if saving succeeds. |

These commands keep Hibi's save/discard/cancel prompts. Force-quit flags do not bypass them. `:w filename` is unsupported; use **Save as** to choose a different path.

Hibi does not run Vimscript, terminal commands, external Vim plugins, or shell escapes. App shortcuts such as `Cmd/Ctrl+K` still open their usual actions.

## Preferences and status

Under **Settings → Plugins → Vim**, choose whether source sessions start in insert mode and whether to show Vim status. Changes to the starting mode apply to new source sessions.

The status bar shows the current mode and pending command, such as `2` → `22` → `22k`. A completed command stays visible until you begin another. Escape cancels a pending command. Search and `:` prompts appear there too; text typed in insert mode does not. Hiding status leaves command prompts available inside the source pane.

Normal view shows **Vim · off**. Switch to source or side-by-side view to use Vim. Disabling the plugin preserves the document and source undo history.

On macOS, holding a key repeats it inside Hibi instead of opening the accent picker. Other apps keep their usual behavior. Use Option-key combinations to enter accented characters.
