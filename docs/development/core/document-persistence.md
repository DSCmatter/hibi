# Document persistence

The renderer sends each text change to the main process as an ordered UTF-16 replacement. A change includes the tab, document revision, previous content version, and next content version. The next content version is its sequence number. The main process validates the range and size limit before applying it, then acknowledges that version. It rejects stale documents, missing changes, conflicting retries, and ranges that split surrogate pairs.

Accepted changes are immediately folded into the main-process document snapshot. A bounded receipt cache makes recent retries idempotent; a lost acknowledgment does not apply the edit twice. Preload retains unacknowledged changes and retries them in order at a flush barrier. A failed barrier rejects the dependent action instead of saving an older snapshot.

Desktop requests that read or act on document content pass through this barrier, including save, autosave, export, tab changes, and addon operations. Native window close also requests a barrier before checking unsaved documents. The legacy whole-source update method remains available and waits for earlier changes.

The main-process snapshot survives a renderer crash. It is not a disk journal: a whole-app crash or power loss can still lose unsaved work. Autosave and ordinary saving provide disk persistence, including the existing checks for external file changes.
