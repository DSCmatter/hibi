# Architecture and security

## Source layout

- `src/main`: windows, validated IPC, document and workspace access, and native addons.
- `src/preload`: the typed bridge. It exposes no general IPC, filesystem, or Node APIs.
- `src/renderer`: editors, settings, the command palette, and renderer addons.
- `src/ui`: controls, theme tokens, shortcut labels, and the shared sidebar.
- `src/addons`: the versioned SDK and bundled addons. Private addons live in `src/useraddons`.
- `src/site`: the read-only documentation viewer, which runs without the Electron bridge.
- `scripts`: build, export, and documentation tools.

## Privileged operations

The main process checks the sender, main frame, and exact app URL before every privileged operation. File dialogs grant access to paths. Workspace calls accept only relative document paths within the selected canonical folder. Native addon calls require an enabled addon and an explicitly registered method.

Document replacement, export, and addon preference writes share an operation guard. Closing the app waits for an active operation and checks for unsaved edits. Workspace watchers debounce changes and read asynchronously. New save destinations resolve their parent directory first, so later saves through a symlink compare the same canonical path and still detect external edits.

Local images are bound to the current document revision. The main process resolves relative references from that document's native path, limits reads to 8 MiB, and validates image content before returning a data URL. This bridge cannot read arbitrary files. Documentation snapshots use the same validated images.

## Appearance and licenses

Colorschemes contain validated hex colors and attribution. The app and exported site share the same color roles. Appearance IPC accepts a valid preference pair and opaque hex window colors; its cache is written atomically and read before window creation. Exports receive preferences through the workspace snapshot, so the documentation addon does not import core code.

The Hibi settings page reads the bundled license catalog through validated IPC. Lists contain metadata; license text loads when a catalog ID is selected. IDs are looked up in the catalog, never used as paths. The sponsor action opens one fixed HTTPS address and accepts no destination from the renderer.

## Runtime boundaries

The renderer is sandboxed and isolated, with Node integration disabled. App assets use a local protocol that rejects path traversal. External navigation, child windows, downloads, and permissions are denied. Development connects only to its local Vite server.

Static exports escape embedded JSON, sanitize rendered Markdown with DOMPurify, and allow only the application script identified by its hash. Fonts and CSS are bundled. Addon code is trusted at build time; opening a workspace never loads its JavaScript as addon code.
