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

Under **Settings → Editing → Vim**, choose whether new source sessions start in insert mode and whether to show the current mode and pending command in the status bar. Escape cancels a pending command.

On macOS, holding a key repeats it inside Hibi instead of opening the accent picker. Use Option-key combinations to enter accented characters.

## Import your key mappings

Turn on **Use Vim/Neovim config** in **Settings → Vim**. This experimental option is off by default. Hibi checks the usual Neovim config location for `init.lua` or `init.vim`, then your home folder for `.vimrc` or `_vimrc`. Use **Choose config…** to select another file, including a separate `keymaps.lua`. Use **Reload** after changing the file.

Hibi reads mappings without running or changing your config. Supported forms include `map`, `noremap`, their normal, insert, visual, and operator-pending variants, and literal calls to `vim.keymap.set` or `vim.api.nvim_set_keymap`. Leader keys and recursive mappings are supported. For example, `inoremap jk <Esc>` lets you leave insert mode with `jk`, and `vim.keymap.set('n', '<leader>w', '<cmd>w<CR>')` saves with your leader key followed by `w`.

Mappings use the Vim actions available in Hibi, including macro recording and playback. Turning the option off removes the imported mappings without clearing your recorded macros or registers. It does not import saved Vim or Neovim sessions.

Lua functions, expressions, buffer-local mappings, external plugin commands, and mappings inside conditions or functions are skipped. Hibi does not follow `source` or `require` statements; select the file containing your mappings directly. Skipped mappings appear in the settings page.

Mapping prefixes wait for the next key. Vim's mapping timeout settings are not imported; press Escape to cancel an unfinished sequence.

The mapping syntax follows the [Vim mapping reference](https://vimhelp.org/map.txt.html) and [Neovim keymap API](https://neovim.io/doc/user/lua/#vim.keymap.set()).
