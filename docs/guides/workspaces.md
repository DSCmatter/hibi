# Workspaces

A workspace is an ordinary folder on your computer. Hibi keeps your files where they are and does not create a separate project format.

## Open a folder

Choose **Open a folder…** in the sidebar, use **Open workspace…** in the command palette, or drop a folder onto Hibi. Opening a folder leaves your current note intact.

The welcome screen lists up to five recent workspaces, newest first. Choose one to reopen it. This list stays in your local app profile. Typing, switching views, or choosing **Dismiss** hides the welcome screen for the rest of the window session.

## Browse notes

Use the sidebar dropdown to choose **Workspace**. Expand folders to find notes, then select a file to open it. Supported [document formats](../editing/formats.md) appear in the tree. Arrow keys move focus, Left/Right collapse or expand a folder, and Enter opens a file.

Opening a file selects its existing tab or creates a new one. Other drafts remain open. In single-file mode, Hibi asks whether to save unsaved changes before replacing the current note. Unsaved files have a dot beside their name.

Use the file and folder menus to [create, rename, duplicate, move, or delete items](../editing/explorer.md). The tree updates when files change; the refresh button lets you request an update.

Hidden files and folders, `node_modules`, and symbolic links are excluded. Folder scans stop at 20,000 entries. If you reach that limit, open a smaller folder.

## Use the page outline

Choose **In this page** from the sidebar dropdown to browse the current note's headings. Headings are nested by level, and the section containing your cursor is highlighted. Select one to move to it. Code-block contents are excluded.

## Show and resize the sidebar

Press `Cmd/Ctrl+/` or use the sidebar button to show or hide the selected view. The sidebar starts hidden when Hibi launches. Opening a workspace shows it, and typing keeps an open workspace visible.

Drag the sidebar's right edge to resize it. The default width is 256 pixels; the usual range is 152–480 pixels, limited by your window. Drag farther past the minimum to collapse it. Double-click the edge to restore the default.

With the resize edge focused, use Left/Right to change width by 8 pixels, or hold Shift for 24-pixel steps. Home/End choose the limits, Enter resets the width, and Escape cancels a drag.

Workspace and settings sidebars share the chosen width. [Exported documentation](exporting.md) remembers a separate width in the reader's browser.
