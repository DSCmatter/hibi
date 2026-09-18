# Version history

Hibi keeps a local snapshot after each successful save. This works without Git.

## Restore an earlier version

1. Run **Version history** from the command palette.
2. Select a timestamp to preview that version.
3. Choose **Restore to editor** and respond to any unsaved-change prompt.
4. Review the restored note, then save when you are ready to replace the file.

Restoring changes the open document first. The file on disk stays unchanged until you save.

## What is kept

History keeps recent saves on this computer, outside your workspace and exported documentation. It has storage limits, so it is not a substitute for a backup. A new note has no history until you save it.

History belongs to a file's path. **Save as** uses the destination's history. If the file saves but its history cannot be stored, Hibi tells you.
