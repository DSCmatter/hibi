# Manage workspace files

Press `Cmd/Ctrl+/` to show the sidebar. Open a file or folder's **More** menu for actions. Right-click and `Shift+F10` open the same menu.

## Create and rename

Use the workspace controls or a folder's menu to create a note or folder. Enter a name and press Enter; Escape leaves the current name.

New folders are created immediately. New notes stay in memory until you save them, and show an unsaved dot. If another file appears at the same destination before the first save, Hibi asks you to choose a different destination rather than replace it.

Renaming a file or its parent folder keeps unsaved edits in open notes.

## Move, copy, and duplicate

The menu offers **Rename**, **Duplicate**, **Copy to**, **Move to**, and **Copy relative path**. For a destination, enter the path from the workspace root, including the new file or folder name. Existing items are never replaced.

You can also drag an item onto a folder to move it. Dropping onto a file targets its parent folder; dropping onto empty sidebar space targets the workspace root.

Copy and Duplicate use the saved file on disk. Save your edits first to include them. Unsaved new notes must be saved before copying.

## Delete

**Move to trash** uses your system trash. Hibi asks before trashing a folder and checks unsaved notes affected by the deletion. Choose Save, Discard, or Cancel when prompted.

Workspace actions stay inside the opened folder. Symbolic links and invalid or reserved names are not supported.
