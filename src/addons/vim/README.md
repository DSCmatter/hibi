# Vim

Turn on **Vim** in **Settings → Addons** for Vim editing in source panes. It supports modes, motions, operators, registers, macros, search, and ex commands. Normal view keeps its usual controls.

## Files and settings

Use `:w`, `:e`, `:enew`, `:q`, `:wq`, and `:x` with Hibi's file dialogs and save checks. Quit commands, including force-quit variants, still check for unsaved edits. Shell commands, Vimscript, external Vim plugins, and `:w filename` are not supported.

In **Settings → Vim**, choose whether to start in insert mode and whether to show Vim status. The status bar shows the current mode and your pending or last command. For example, typing `22k` shows `2` → `22` → `22k`, then keeps the completed command visible. Escape cancels a pending command and restores the last one; Enter alone leaves it visible.

Search and `:` prompts show their input and keep it visible after Enter. Text typed in insert mode is not collected for the status display. Uppercase keys keep their case even when Hibi's lowercase interface option is on.

See the [Vim guide](../../../docs/guides/vim.md) for more examples.

## Credits

Hibi integration: may (Discord `1262793452236570667`) and [angelo](https://github.com/angelofallars). Vim engine: the [CodeMirror Vim contributors](https://github.com/replit/codemirror-vim). License notices are in Hibi's **Open source licenses**.
