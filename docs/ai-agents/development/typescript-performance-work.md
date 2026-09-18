# TypeScript performance and extensibility work

The September 18 audits were reviewed against the current checkout. Their timing figures refer to older revisions and are not a baseline for this work. Rust ports and Electron/V8 snapshot experiments are outside this implementation pass.

## Sequence

1. Establish consistent input measurements and preserve the existing startup benchmark.
2. Remove repeated editor setup, batch toolbar publication, narrow formatting invalidation, and avoid building a closed palette.
3. Correct addon installation failures and independent cleanup; add a monotonic content version.
4. Separate source-editor dependencies from rich-only startup and overlap native bootstrap reads.
5. Introduce versioned, validated document edits with explicit history and stale-result behavior. Keep navigation mappings separate from exact editing mappings.
6. Build a concrete review integration on the shared document contract before adding broader view or runtime abstractions.

Each stage needs relevant regression checks and measurements before its performance claims are recorded. Save, close, tab replacement, external changes, composition, and addon disable must preserve content. Existing API v1/v2 addons remain compatible; optional contracts do not justify a breaking API bump.

## Measurement conditions

The startup script includes automation and hidden-window overhead. Its historical first and subsequent input timings use different endpoints and remain labeled separately. The input script uses a consistent driver endpoint and separately instruments synchronous ProseMirror dispatch in isolated benchmark profiles. Physical presentation and packaged foreground startup remain separate measurements.

## Progress

The initial baseline is revision `135aecd`. Ten hidden-window startup runs measured a fresh-profile median of 589.6 ms to editable and 595.5 ms to editor plus workspace-list readiness. The corresponding p95 values were 1853.4 and 1856.1 ms. Nine warm-profile runs measured 478.9 and 485.6 ms medians. These are exploratory local results, not a cold-cache or physical-presentation claim.

Five separate input runs per fixture measured synchronous transaction p95 at 3.1 ms for a blank document, 4.6 ms for the large document, and 3.7 ms for code-heavy Markdown. Every transaction performed 35 formatting capability checks and one Markdown serialization. Startup and input measurements ran sequentially.

The first implementation memoizes editor extensions, batches toolbar publication, refreshes formatting before the next frame, and skips closed-palette construction. It keeps conservative capability checks instead of caching by paragraph: marks, history, tables, and addon commands can change availability within the same paragraph. This removes work from dispatch and coalesces bursts; it does not claim to eliminate all toolbar work. UTF-8 limit checks retain exact boundary behavior while avoiding encoding when UTF-16 length proves the result.

After this change, the same five-run input benchmark measured transaction p95 at 0.6, 2.5, and 1.2 ms respectively. Synchronous formatting checks fell to zero; Markdown serialization remains once per edit. First driver-response p95 was 28.9, 44.3, and 58.4 ms, so these results do not meet the first-response target. The full check passed 154 of 156 tests initially; autosave and toolbar tests needed to wait for replacement-editor readiness and the next-frame button update. Both suites passed after those test fixes. Type checking, docs checks, and Unicode boundary tests passed.

The second stage makes attachment failures fail visibly and read-only in both editors. A failed rich attachment unwinds earlier attachments. Host disposal attempts every cleanup and aggregates failures. The new `contentVersion` tracks text changes separately from editor replacement, including undo/redo, tab restoration, and external reloads. This is a versioning foundation, not yet an atomic addon-edit protocol. Six focused lifecycle, editability, cleanup, and version tests passed, along with the build and regenerated API checks.

The third stage removes eager CodeMirror imports from rich-editor cursor and scrolling code. A mounted-view registry serves those callers. Markdown registers a lazy parser; other addons can use the same additive `CodeLanguage.load` contract or keep their existing eager parsers. Plain text needs no parser. Source view waits for its enabled parser and attachments, and reports failures separately from readiness. Eleven focused tests passed, including actual startup module inspection, view changes, cursors, find, and parser disposal races.

The same ten-run startup benchmark now measures 464.6 ms median to editable and 471.3 ms to editor plus workspace-list readiness for fresh profiles, with p95 at 731.6 and 738.7 ms. Initial renderer JavaScript fell from 1,462,943 to 1,175,396 bytes. Warm readiness median was 456.8 ms. These local samples support the reduction; they do not establish a sub-500 ms tail or packaged foreground guarantee.

The fourth stage adds `applySourceEdits()`: exact UTF-16 ranges, expected text, tab/revision/content-version validation, composition and busy guards, bounded idempotency, and one isolated CodeMirror undo operation. It updates addon snapshots synchronously and queues native persistence before observers can request a save. A real installed review-addon fixture tests multi-edit corrections, stale proposals, duplicate requests, immediate native reads, undo isolation, tab changes, and addon disposal. Rich edits return an explicit unsupported-view result; approximate navigation mappings are not used. The first full check of this stage passed all 162 tests; final checks also cover the added synchronous busy guard.
