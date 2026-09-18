# Hibi

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://app.codspeed.io/schmayterling/hibi?utm_source=badge)

Hibi is a desktop editor for local notes and documents. Write in Markdown, edit the source, or keep both views side by side. Your files stay in ordinary folders.

## Get started

Download a build from [Releases](https://github.com/schmayterling/hibi/releases). Back up your notes before using a nightly build.

Start typing, open a file, or open a folder as a workspace. Use `Cmd+K` on macOS or `Ctrl+K` on Windows and Linux to find commands and settings.

Read the [user guide](docs/README.md) for editing, settings, workspaces, and exports.

## Your files

Save your work before quitting. Unsaved drafts can be lost in an app or machine crash; [version history](docs/editing/version-history.md) keeps previous saves.

Opening a document does not run its embedded code. Formats that need to execute code have a separate **Run document** action and ask for confirmation.

## Build from source

Use Node 24 LTS (`nvm use`), or Node 22.18 or later:

```sh
npm ci
npm run dev
```

For build commands, tests, and addon development, see [developer and agent notes](docs/ai-agents/README.md).

## License

Hibi uses the [GNU Affero General Public License v3.0](LICENSE). Third-party credits and license texts are available in **Settings → Hibi → Open source licenses**.
