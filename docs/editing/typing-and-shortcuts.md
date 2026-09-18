# Keyboard shortcuts

Use `Cmd` on macOS and `Ctrl` on Windows and Linux where a shortcut says `Cmd/Ctrl`. Change app shortcuts under **Settings → Hotkeys**.

## App shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Search commands and settings |
| `Cmd/Ctrl+F` | Find text in the current note |
| `Cmd/Ctrl+/` | Show or hide the sidebar |
| `Cmd/Ctrl+N` | New note |
| `Cmd/Ctrl+O` | Open a file |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+S` | Save as |
| `Cmd/Ctrl+W` | Close the current tab |
| `Cmd/Ctrl+[` / `]` | Go back / forward |
| `Cmd/Ctrl+Shift+[` / `]` | Normal / Source view |
| `Cmd/Ctrl+Shift+\` | Side-by-side view |

## Markdown formatting

These shortcuts work in source panes as well as the formatted editor. The toolbar shows the actions available for the current format.

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+E` | Inline code |
| `Cmd/Ctrl+Shift+X` | Strikethrough |
| `Cmd/Ctrl+Alt+0` | Paragraph |
| `Cmd/Ctrl+Alt+1`–`6` | Heading level |
| `Cmd/Ctrl+Shift+7` | Numbered list |
| `Cmd/Ctrl+Shift+8` | Bullet list |
| `Cmd/Ctrl+Shift+9` | Task list |
| `Cmd/Ctrl+Shift+B` | Quote |
| `Cmd/Ctrl+Alt+C` | Code block |
| `Cmd/Ctrl+Enter` | Continue after a final formatted block |

Custom app bindings take precedence over formatting shortcuts. [Vim](../guides/vim.md) handles its own keys first in source mode.

## Typing speed

The optional Typing speed plugin shows estimated words or characters per minute for your current typing session. It counts typed text, not pasted text or deletions. The rate resets after five seconds without typing, and uses at least one second when calculating a new session's rate.

For document totals, enable Word count under **Settings → Addons**.

## Side-by-side editing

The faint caret in the inactive pane shows the matching text position. It hides when text is selected or the corresponding position is offscreen. Scrolling keeps matching passages aligned; other format previews use relative scroll positions when text matching is unavailable.
