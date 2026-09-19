# Document persistence

The renderer sends text changes to the main process through one ordered journal. It accepts legacy UTF-16 replacements and atomic `SourceOperation` batches. Both include the tab, document revision, previous content version and next content version. Atomic batches also carry an operation ID, origin and history group. All ranges use the same pre-state. The main process validates the entire operation and size limit before committing it, then acknowledges that version. It rejects stale documents, missing changes, conflicting retries and invalid Unicode boundaries.

Each tab has a persistent source store and an immutable saved snapshot. Accepted changes update that store without reconstructing the complete source string. Tab metadata and ordinary dirty checks do not materialize document text. Full source remains available for explicit legacy reads, saving and export. A bounded receipt cache makes recent retries idempotent; a lost acknowledgment does not apply the edit twice. Atomic acknowledgments include the operation ID. Preload retains unacknowledged changes, accounts for their queued bytes, and retries them in order at a flush barrier. A failed barrier rejects the dependent action instead of saving an older snapshot.

Desktop requests that read or act on document content pass through this barrier, including save, autosave, export, tab changes, and addon operations. Native window close also requests a barrier before checking unsaved documents. The legacy whole-source update method remains available and waits for earlier changes.

Preload announces journal readiness before exposing editing APIs. Closing a window before that bridge exists does not wait for a response it cannot send; existing native snapshots still receive the unsaved-change check.

The main-process snapshot survives a renderer crash. It is not a disk journal: a whole-app crash or power loss can still lose unsaved work. Autosave and ordinary saving provide disk persistence, including the existing checks for external file changes.

The recovery screen can reload the main frame's trusted app entrypoint and recover the native snapshot. The navigation guard allows that same entrypoint in production and development while rejecting other paths, query strings, external destinations and subframe navigation. A failed editor-module load uses this same recovery path.

Saving captures a particular immutable source snapshot. Completing that write updates the saved baseline for that snapshot, while newer source remains dirty. Exact source operations reject boundaries inside CRLF. The legacy bridge preserves its previous raw-offset meaning by extending only a split CRLF boundary before applying it to the store.

Renderer migration to exact operation production is ongoing; legacy producers may still flatten and diff source before enqueueing. Receipt-horizon resynchronization and sender backpressure remain separate migration work. See the [document-engine migration](document-engine.md) for the distinction between implemented foundations and complete editor integration.
