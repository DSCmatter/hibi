# Graph

See how your notes connect. Turn on **Graph** in **Settings → Addons**, open a workspace, then choose **Open workspace graph** from the command palette, toolbar, or sidebar view menu.

Each dot is a note. Lines connect notes that link to one another with local Markdown links. Relative paths, paths from the workspace root, encoded filenames, and reference links work. External links, images, code examples, missing files, self-links, and `[[wikilinks]]` do not create connections.

## Explore the graph

- Click a dot to open and center its note. Tab to a dot and press Enter or Space to use the keyboard.
- Drag a dot to move it, drag the background to pan, and scroll to zoom. Arrow keys pan when the graph background has focus.
- Filter by filename or path. Use the zoom and fit buttons to adjust the view.
- Choose **Expand** for a larger graph in a dialog. You can keep it open while selecting notes.

The selected note stays centered while the graph settles. Panning, dragging, zooming, or choosing **Fit graph** lets you move away from it. Below the graph, **Connections** lists notes linked to or from the current note, even when the filter hides them.

The graph refreshes as you edit, when workspace files change, and when Hibi regains focus. Opening a note still checks for unsaved changes. Ordinary prose edits keep the layout steady.

## Limits and privacy

The graph reads up to 2,000 workspace documents totaling 20 MiB and displays up to 500 matching notes at once. Use the filter to narrow a larger workspace. Edits to an existing workspace note appear before you save; new drafts without a workspace path are excluded.

The plugin keeps no saved index or layout and makes no network requests. Your reduced-motion preference turns off the opening animation.

## Credits

Hibi integration: may (Discord `1262793452236570667`). Layout uses [d3-force](https://d3js.org/d3-force), copyright Mike Bostock and contributors, under the ISC license. Its notice and dependencies are in Hibi's **Open source licenses**.
