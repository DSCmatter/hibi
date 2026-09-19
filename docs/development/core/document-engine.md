# Document-engine migration

The document-engine work preserves each format's original source while replacing whole-document work in editing paths. Source editing, visual authoring, preview and final compiler layout are separate capabilities. A preview or a raw-source dialog does not establish visual editing support.

## Persistent source foundation

`src/shared/source-buffer.ts` implements an internal persistent piece B+ tree. Published snapshots own immutable nodes and chunk ranges. A local replacement copies affected paths and bounded descriptor arrays; untouched chunks and subtrees remain shared. Splits and joins restore node occupancy, including after bulk deletion. The initial experimental defaults are 32 children per branch, 64 pieces per leaf and 4,096 UTF-16 units per original chunk. These are candidates pending integrated editor measurements, not established optimal constants.

Each chunk has private sparse coordinate indexes. Subtree summaries combine raw UTF-16 length, normalized length, UTF-8 size and logical newline count, including CRLF and surrogate pairs crossing piece boundaries. Raw positions inside CRLF are not normalized editor positions. Exact edits also reject split surrogate pairs. Streaming encoding carries a pending high surrogate across chunks. This describes encoding of the source string; it does not introduce a new policy for decoding invalid file bytes.

`SourceOperation` contains one document identity, base/result versions, operation identity, origin, history group and sorted disjoint raw changes. The store validates all changes before publication. Preparation returns a private capability; forged, consumed, aborted or stale preparations cannot commit. Inverse edits use post-state coordinates and expand only where necessary to restore a newly formed CRLF or Unicode seam. Undo is a new operation with a higher content version.

Snapshots remain readable after edits and compaction. Compaction changes the storage epoch without changing the content version. JavaScript reachability currently retains chunks needed by snapshots; session-level history, job ownership, journal and save integration must provide the corresponding retention bounds. Mutable hot gaps and transferable shared backing buffers are not used.

Insertions share a private append-only arena. Each published piece freezes its readable range; later writes only extend the allocation beyond that range. Sparse prefix entries below an existing extent never change. Consecutive ranges in source order coalesce into one piece, while separate cursors may share storage without sharing an occurrence. Aborted preparations can leave unused slots. The writer retains at most one chunk, but gaps in chunks still referenced by live pieces require compaction; scheduling and retention budgets remain unfinished. Compaction seals the current writer. Arena typed arrays and writer handles never leave the kernel. Counters distinguish allocated and written arena units, and benchmarks include external/ArrayBuffer memory as well as JavaScript heap use.

`DocumentSession` adds grouped source/visual history and stable metadata subscriptions without a UI dependency. It composes exact edit batches without diffing the document. Source and metadata advance before recovery is synchronously enqueued, the active view reconciles, and observers are notified. Undo and redo produce new operations. Reentrant edits are rejected at that observation boundary; an observer failure cannot roll back accepted source.

History retains at most 128 groups and 8 MiB of operation payload by default. Grouped operations have separate count/size bounds. Saved snapshots refer to a specific version, so finishing an older save cannot clean newer changes. Undo uses known content identities; returning to saved text through another edit path runs a cancellable, chunked equality check after input. Dirty state stays conservative until that exact comparison finishes.

Native recovery uses the buffer for both legacy replacements and atomic operations. The renderer retains a session per open tab. Ordinary CodeMirror input converts accepted changes directly into one atomic operation before view callbacks; external operations update changed normalized ranges. Raw selection anchors and shared history survive editor remounts and tab identity changes. The SDK's CodeMirror undo/redo commands and Vim route to host history; standalone addon-created editors retain native CodeMirror history behavior.

Legacy full-document reads are immutable snapshot facades with explicitly materialized string getters. Range-aware annotations avoid those getters. Whole-source compatibility transforms and current rich serialization still use a full-source boundary, and the current rich pane remains a complete model. Removing hidden rich work, bounding visual models and migrating default full-source consumers remain separate unfinished parts of this migration. Existing desktop size and execution guards remain in force. No large-file visual performance claim follows from the source bridge alone.

## Verification and measurement

Run `node --test tests/source-buffer.test.mjs` for metric/seam properties, exact coordinate conversion, atomic validation, inverse operations, retained snapshots, fragmentation, deletion rebalancing and compaction. A 100,000-line prefix-edit test checks bounded visits and zero complete source materialization. It is a locality check, not an end-to-end latency claim.

Run `node --test tests/document-session.test.mjs` for random edit composition, recovery/observer order, stable state identity, shared grouped history, save races, retention bounds and reentrancy.

Run `node --test tests/source-session.test.mjs tests/document-runtime.test.mjs` for accepted CM filters, mirrored source operations, shared selection/history, atomic rejection, immutable legacy reads, native saved-baseline imports and tab reidentification. The bridge test includes 1,000 local edits in 100,000 lines and counts complete source materializations.

Run `node --expose-gc scripts/benchmark-source-buffer.mjs /path/to/kernel-results.json` to compare the 27 fanout/leaf/chunk configurations across 1k, 10k and 100k lines. `HIBI_KERNEL_RUNS` and `HIBI_KERNEL_EDITS` control repetitions. Reports include p50/p95/p99, copied slots, scans, shape, retained roots and heap use. The CodeMirror Text control measures storage alone and does not provide the raw coordinate/UTF-8 metric contract; it must not be presented as an equivalent complete engine. Production selection also requires the [desktop source and visual matrix](measuring-performance.md#document-engine-scale-measurements).

`HIBI_KERNEL_PATTERN=typing` measures consecutive insertion at one moving caret. The default `rotating` workload alternates document start, middle and end; keep that pattern when comparing older reports.

## Incremental parser input

`source-parser.ts` gives Lezer a normalized UTF-16 `Input` backed by an immutable source snapshot. Chunks start at the requested offset and have a bounded size. Complete range reads are counted separately. Source operations map Lezer fragments using normalized pre/post coordinates, including CRLF seams. Partial work is canceled on the next operation; retained fragments still receive every ordered change. Dialect/parser changes discard incompatible reuse.

Only complete, full-length trees are published as complete. `advance()` is an indivisible parser step whose duration is measured; scheduling it with a timer does not turn it into bounded or isolated work. Fragment retention has a fixed cap. The current tests compare incremental CommonMark and GFM trees against full parsing; production owner indexing, worker isolation and complete Hibi/addon dialect proofs are not yet connected. This module does not claim resumable checkpoints for `marked`.

## Paged source-owner order

`source-owners.ts` provides an immutable order and position index for contiguous coarse owners. Leaves contain bounded record pages; directory nodes store owner counts and source lengths. A prefix insertion copies touched pages and directory paths, without changing later owner records or writing their absolute positions. Updating one owner preserves its slot and increments its record revision. Handles include a store epoch; slots are monotonic and never recycled in that epoch. Source offsets and slots retain safe-integer arithmetic across the 32-bit boundary.

The prototype supports configurable 128/512/4096-record pages for comparison, counts copied/queried slots and validates balanced occupancy. Tests cover 1,500 random splice sequences, retained snapshots, 100k-owner locality, numeric overflow and immutable records. This is currently an internal order-index foundation. Parser-to-owner reconciliation, nested parent/child indexes, overlapping annotation indexes and production view attachment remain unfinished; no semantic or visual capability is inferred from this index alone.
