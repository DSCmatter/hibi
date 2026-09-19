# Document-engine migration

The document-engine work preserves each format's original source while replacing whole-document work in editing paths. Source editing, visual authoring, preview and final compiler layout are separate capabilities. A preview or a raw-source dialog does not establish visual editing support.

## Persistent source foundation

`src/shared/source-buffer.ts` implements an internal persistent piece B+ tree. Published snapshots own immutable nodes and chunk ranges. A local replacement copies affected paths and bounded descriptor arrays; untouched chunks and subtrees remain shared. Splits and joins restore node occupancy, including after bulk deletion. The initial experimental defaults are 32 children per branch, 64 pieces per leaf and 4,096 UTF-16 units per original chunk. These are candidates pending integrated editor measurements, not established optimal constants.

Each chunk has private sparse coordinate indexes. Subtree summaries combine raw UTF-16 length, normalized length, UTF-8 size and logical newline count, including CRLF and surrogate pairs crossing piece boundaries. Raw positions inside CRLF are not normalized editor positions. Exact edits also reject split surrogate pairs. Streaming encoding carries a pending high surrogate across chunks. This describes encoding of the source string; it does not introduce a new policy for decoding invalid file bytes.

`SourceOperation` contains one document identity, base/result versions, operation identity, origin, history group and sorted disjoint raw changes. The store validates all changes before publication. Preparation returns a private capability; forged, consumed, aborted or stale preparations cannot commit. Inverse edits use post-state coordinates and expand only where necessary to restore a newly formed CRLF or Unicode seam. Undo is a new operation with a higher content version.

Snapshots remain readable after edits and compaction. Compaction changes the storage epoch without changing the content version. JavaScript reachability currently retains chunks needed by snapshots; session-level history, job ownership, journal and save integration must provide the corresponding retention bounds. Mutable hot gaps and transferable shared backing buffers are not used.

`DocumentSession` adds grouped source/visual history and stable metadata subscriptions without a UI dependency. It composes exact edit batches without diffing the document. Source and metadata advance before recovery is synchronously enqueued, the active view reconciles, and observers are notified. Undo and redo produce new operations. Reentrant edits are rejected at that observation boundary; an observer failure cannot roll back accepted source.

History retains at most 128 groups and 8 MiB of operation payload by default. Grouped operations have separate count/size bounds. Saved snapshots refer to a specific version, so finishing an older save cannot clean newer changes. Undo uses known content identities; returning to saved text through another edit path runs a cancellable, chunked equality check after input. Dirty state stays conservative until that exact comparison finishes.

The buffer is currently a migration building block exercised by differential tests and benchmarks. Its existence does not mean the desktop editors, native recovery, visual adapters or all legacy snapshot consumers have completed migration. Existing desktop size and execution guards remain in force.

## Verification and measurement

Run `node --test tests/source-buffer.test.mjs` for metric/seam properties, exact coordinate conversion, atomic validation, inverse operations, retained snapshots, fragmentation, deletion rebalancing and compaction. A 100,000-line prefix-edit test checks bounded visits and zero complete source materialization. It is a locality check, not an end-to-end latency claim.

Run `node --test tests/document-session.test.mjs` for random edit composition, recovery/observer order, stable state identity, shared grouped history, save races, retention bounds and reentrancy.

Run `node --expose-gc scripts/benchmark-source-buffer.mjs /path/to/kernel-results.json` to compare the 27 fanout/leaf/chunk configurations across 1k, 10k and 100k lines. `HIBI_KERNEL_RUNS` and `HIBI_KERNEL_EDITS` control repetitions. Reports include p50/p95/p99, copied slots, scans, shape, retained roots and heap use. The CodeMirror Text control measures storage alone and does not provide the raw coordinate/UTF-8 metric contract; it must not be presented as an equivalent complete engine. Production selection also requires the [desktop source and visual matrix](measuring-performance.md#document-engine-scale-measurements).
