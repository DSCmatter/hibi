# Getting to know the codebase

Hibi is an Electron app. The main process owns native operations, while the renderer displays the React interface and editors. A small preload bridge connects them.

| Folder | What belongs here |
| --- | --- |
| `src/main` | Windows, documents, workspaces, file validation, and native addon calls. |
| `src/preload` | The typed bridge between the renderer and main process. |
| `src/renderer` | Editors, tabs, settings, and the command palette. |
| `src/shared` | Types and logic shared across processes. |
| `src/ui` | Controls, dialogs, colors, spacing, and the sidebar. |
| `src/addons` | The addon API and bundled plugins. |
| `src/useraddons` | Git-ignored addons for local development. |
| `src/site` | The standalone HTML workspace viewer. |
| `scripts` | Development, build, documentation, and release tools. |
| `tests` | Automated checks, including real Electron flows. |
| `bench` | Core and desktop performance benchmarks. |

## Follow a feature through the app

Start with the visible control or command in the renderer. Follow its call through `src/shared/desktop.ts` and `src/preload/index.ts` if it needs native work, then inspect its handler under `src/main`. Check other callers before changing shared behavior.

For a plugin feature, start with its folder in `src/addons`. Its manifest describes the addon, its renderer entry registers features, and an optional `native.ts` implements native operations. Prefer the addon API over importing app internals.

## Keep the boundaries intact

The renderer has no Node or general filesystem access. Native handlers validate the sender and each input. Paths must come from a user-selected file or workspace and pass the main process's checks. Preserve unsaved-edit prompts and external-change detection when changing file operations.

Opening a workspace must never execute its files as addon code. The exported HTML viewer runs without Electron and sanitizes document HTML.

## Reuse shared UI

Use `src/ui` controls and theme tokens for new interfaces. The app, addons, and exported sites share the sidebar. Keep new UI text brief and use complete sentences when an explanation is needed.
