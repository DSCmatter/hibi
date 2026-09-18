# Version history

Hibi keeps a local snapshot after each successful save. This works without Git.

## Restore an earlier version

1. Run **Version history** from the command palette.
2. Select a timestamp to preview that version's source.
3. Choose **Restore to editor**. Hibi asks what to do with any unsaved changes.
4. Review the restored note, then save when you are ready to replace the file.

Restoring changes the open document first; it does not immediately replace the file on disk. Normal external-change checks still apply when you save.

## What is kept

Each file keeps up to 100 snapshots and 20 MiB of history, with at least its latest snapshot retained. Identical consecutive saves do not add copies. The first save of an edited file also records its previous disk contents, including an outside version you explicitly choose to replace.

History stays in Hibi's private app data. It is not written into your workspace or included in documentation exports. If a file saves successfully but its history cannot be stored, Hibi tells you.

History belongs to the file's path. **Save as** uses the destination's history. A new note has no saved versions until you save it. Previewing a version does not run its code or HTML.
