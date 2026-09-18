# Hibi

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://app.codspeed.io/schmayterling/hibi?utm_source=badge)

Hibi is a desktop editor for local notes and documents. Write in Markdown, edit the source, or keep both views side by side. Your files stay in ordinary folders.

## Get started

Download a build from [Releases](https://github.com/schmayterling/hibi/releases). Back up your notes before using a nightly build.

Start typing, open a file, or open a folder as a workspace. Use `Cmd+K` on macOS or `Ctrl+K` on Windows and Linux to find commands and settings.

- Open several notes in tabs, or use single-file mode.
- Add images and videos, follow local links, and browse headings in the sidebar.
- Enable plugins for other [document formats](docs/editing/formats.md), tags, graphs, Vim, word counts, and block dragging.
- Export a folder of notes as one HTML file with navigation and search. It works offline.

Read the [user guide](docs/README.md) for editing, settings, workspaces, and exports.

## Your files

Hibi works with UTF-8 text files up to 2 MiB. Saving checks for outside changes before replacing a file. Local [version history](docs/editing/version-history.md) keeps previous saves.

Unsaved drafts live in memory. Hibi can recover them after an editor reload, but quitting or a full app or machine crash can lose unsaved work. Accounts and cloud sync are not included.

Opening a document does not run its embedded code. Formats that need to execute code have a separate **Run document** action and ask for confirmation. See [document formats](docs/editing/formats.md#run-or-compile-a-document).

## Build from source

Use Node 24 LTS (`nvm use`), or Node 22.18 or later:

```sh
npm ci
npm run dev
```

For build commands, tests, addon development, and architecture, see [developer and agent notes](docs/ai-agents/README.md).

## License

Hibi uses the [GNU Affero General Public License v3.0](LICENSE). Third-party credits and license texts are available in **Settings → Hibi → Open source licenses**.
