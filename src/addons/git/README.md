# Git

Review changes and commit your notes without leaving Hibi. Install Git, turn on **Git** in **Settings → Addons**, and open your repository's root folder as a workspace. Choose **Git** from the sidebar view menu or find its commands in the command palette.

## Review and commit

The sidebar shows your branch, changed files, differences, and commits ahead of or behind the remote. Save your editor changes before staging: Git uses the files on disk.

1. Select a file to review its staged and unstaged changes.
2. Stage the files you want to commit.
3. Click the commit icon, enter a message, and commit.

Your message draft stays available if you close the dialog or switch views while the plugin remains on. A clean repository shows a confirmation instead of an empty changes list.

## Branches and remotes

Use the **Branch** section to switch local branches or create a local branch that tracks an existing remote branch. **Pull** only accepts fast-forward updates; Hibi does not merge diverging branches. **Push** sends commits to the configured upstream.

Pulling and switching branches require a clean working tree and saved editor changes. Hibi reloads the active file and updates the explorer afterward. Remote operations only run when you choose them.

Authentication uses your SSH agent and configuration, or Git's Keychain helper for HTTPS on macOS. Use SSH on other platforms. Operations stop after 90 seconds; command output is limited to 4 MiB.

## Explorer markers

| Marker | Meaning |
| --- | --- |
| `M` | Modified |
| `A` | Added |
| `U` | Untracked |
| `R` | Renamed |
| `!` | Merge conflict |
| `D` | Deleted; shown in the Git sidebar |

Changed folders show a dot. Hover over a file or folder for details and change counts, including files the explorer does not display. These markers describe saved files; the editor's unsaved-change dot is separate.

Status updates when files change or the window regains focus. You can also refresh it. For changes made by another Git client in a linked worktree, focus Hibi or refresh the sidebar.

## When to use another Git client

Use your usual Git client for force pushes, resets, stashes, merges, signed commits, repository hooks, or files that need custom filters. Hibi also disables custom credential helpers, external diff commands, filesystem monitors, automatic maintenance, and submodule recursion.

## Credits

Hibi integration: may. See Git's documentation for [hooks](https://git-scm.com/docs/githooks), [configuration](https://git-scm.com/docs/git-config), and [attributes](https://git-scm.com/docs/gitattributes).
