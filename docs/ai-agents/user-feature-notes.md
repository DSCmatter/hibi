# Implementation notes behind the user guides

These notes collect code-level details removed from the public guides. Read the relevant source before changing behavior; the guides describe what users can do.

## Editor state and file safety

Switching views must preserve the original source. Rich-text edits may normalize Markdown, but unsupported syntax must remain protected from lossy conversion. Frontmatter body edits preserve the original YAML; property edits preserve the body, delimiters, line endings, and surrounding whitespace.

Open tabs retain unsaved drafts during a renderer reload. Clean files refresh from disk when revisited; dirty tabs keep their saved baseline for external-change checks. Moving workspace files updates open paths. Folder deletion checks every affected tab. Quitting does not restore open tabs on the next launch.

Saves write and sync a temporary file before renaming it over the destination. Existing permissions are preserved. Draft recovery in the main process does not protect against a full process or machine crash.

## Selection and scrolling

Source formatting should create one undo step and restore editor focus. Line-number selection must exclude gutter text from copied content. In side-by-side view, caret and scroll mapping use corresponding visible text; metadata, nonempty selections, and offscreen positions hide the secondary caret. Formats without a text map use proportional scrolling.

Whole-document addon actions preserve source-editor undo. Their rich-editor equivalents can rebuild the editor and reset undo, which must remain clear in user-facing instructions.

## Typing events

`context.editor.onInput(listener)` reports committed typing as a character count and editor view. It excludes pasted text, deletion, shortcuts, and programmatic changes. Dispose listeners when the addon stops. The typing-speed plugin resets after five idle seconds and uses a one-second denominator floor at the start of a session.

## Window and editor presentation

Keep top-bar space reserved when hiding it so the document does not jump. Toolbar auto-hide can collapse its space. Source-editor loading should finish font loading and initial layout before showing its content. Hidden source panes pause document synchronization. File switches retain pane positions and do not replay view-switch animations.

Workspace, settings, and exported pages reuse the sidebar. Desktop workspace and settings share a width; exports store their width separately. Reduced-motion settings must remove animation without changing navigation or keyboard behavior.

## Licenses and assets

`scripts/licenses.ts` generates the application notice catalog from installed runtime packages and maintains build-tool exclusions. Missing package notices fail the build. `src/shared/theme-licenses.ts` supplies pinned colorscheme notices. The app ships the catalog in `out/licenses.json`; Electron's extra notices remain in `licenses/electron-third-party.html` inside packaged resources.

Geist Sans and Mono load from bundled WOFF2 files. Their notice is in `resources/licenses/geist.txt`. The generated one-second blue video in `tests/fixtures/clip.webm` contains no third-party footage.

## File associations

Installer registrations and built-in format declarations share `src/shared/file-associations.ts`. macOS uses Launch Services. Windows opens Default apps instead of rewriting protected UserChoice keys. Linux registers a user launcher and MIME types, then uses `xdg-mime` and verifies the result. Development and preview builds must not change system defaults.

Platform references: [Electron file-open events](https://www.electronjs.org/docs/latest/api/app#event-open-file-macos), [Windows Default apps](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-default-apps-settings), and [desktop entries](https://specifications.freedesktop.org/desktop-entry-spec/latest/).
