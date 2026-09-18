# Graphs and tags

Enable **Graph** or **Tags** under **Settings → Addons**, then choose the view from the sidebar dropdown. Both work locally and update when workspace files or the current note change.

## Graph

Run **Open workspace graph** to see notes connected by local Markdown links, such as `[Next](notes/next.md)`.

Click a node to open and center its note. Drag a node to move it, drag the background to pan, and scroll or use the buttons to zoom. **Fit graph** brings the visible nodes into view. **Expand** opens a larger graph in a dialog; selecting a note keeps the dialog open.

Filter by filename or path. **Connections** lists links to and from the current note, even if those notes are outside the filter. Click a connection to open it.

Keyboard users can Tab to a node and press Enter or Space. Arrow keys pan when the graph background has focus. Opening a note keeps the usual unsaved-change checks.

The graph shows up to 500 matching nodes at once. Narrow the filter for larger workspaces. It includes existing local note links, including reference links, but excludes web links, images, missing destinations, and `[[wikilinks]]`. Moving nodes changes only the current layout, not your files.

## Tags

Write tags in Markdown prose, such as `#work` or `#project/topic`. Tags support letters, numbers, underscores, and hyphens. Matching ignores case; a number alone, such as `#123`, is not a tag.

Shift-click a highlighted tag or run **Browse tags**. Filter the tag list, choose a tag, then select a matching note. The status bar shows a tag count when the current note has tags; click it to open the browser.

Code, escaped hashes, heading markers, links, HTML, and frontmatter do not count as tags. Tags stay plain Markdown when the plugin is disabled or the document is exported.

## Workspace limits

Both plugins read up to 2,000 documents and 20 MiB of workspace text. They include unsaved edits to the active note when it has a workspace path. New drafts without a path do not appear in workspace results, though their tags can still appear in the status count.

Neither plugin saves an index to disk or sends note contents to a server. Their [Graph](../../src/addons/graph/README.md) and [Tags](../../src/addons/tags/README.md) pages include credits.
