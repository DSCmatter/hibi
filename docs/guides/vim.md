# Vim editing

Enable **Vim** under **Settings → Addons** to use Vim keys in source view and the source pane of side-by-side view. The formatted editor keeps its usual controls.

Use `ciw` to change a word, `/word` to search, or `:%s/old/new/g` to replace text.

## File commands

| Command | Action |
| --- | --- |
| `:w` | Save. An untitled note opens the save dialog. |
| `:e` | Open the file picker. |
| `:e relative/path.md` | Open a file in the current workspace. |
| `:enew` | Start a new note. |
| `:q` | Close the window. |
| `:wq` or `:x` | Save, then close if saving succeeds. |

These commands keep Hibi's unsaved-change prompts, including with force-quit flags. Use **Save as** instead of `:w filename`. Vimscript, external Vim plugins, and shell commands are unsupported.

## Preferences and status

Under **Settings → Plugins → Vim**, choose whether new source sessions start in insert mode and whether to show the current mode and pending command in the status bar. Escape cancels a pending command.

On macOS, holding a key repeats it inside Hibi instead of opening the accent picker. Use Option-key combinations to enter accented characters.
