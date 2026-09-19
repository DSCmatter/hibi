# Local diagnostics

Local diagnostics observe failures independently of the document engine. They do not subscribe to editing, read source state, flush the journal, acknowledge edits or participate in save and close barriers. The optional performance addon is unrelated and is not enabled by logging.

## Profiles and identity

Logging is enabled by default. An unpackaged app selects `debug`; a packaged app selects `release`. Set `HIBI_DIAGNOSTIC_PROFILE=debug` or `release` when building to select either profile explicitly, including a packaged debug build. This is a build choice, not a renderer or runtime CLI setting. Both profiles reject the same private data.

Build metadata records the Git revision with a dirty suffix when applicable, or `unknown` for a source archive. Runtime metadata comes from the main process. The generated artifact catalog assigns numeric IDs to trusted output files. Worker filenames require approval from their actual build module graph before Vite converts them into assets. Private addon code and unknown generated code are excluded. Keep the matching build and catalog when investigating numeric frame locations; the report does not contain source maps or paths.

## Privacy boundary

Records use a finite event catalog, integer locations, static roles and reasons, and a small error-code allowlist. No generic object serializer, arbitrary metadata bag, console interception or raw exception message is supported. Renderer records cross a separate raw IPC channel in bounded batches. Main validates frame ownership, origin, generation, fields, sizes and artifact IDs again. A transport acknowledgement means the batch was consumed, including deliberate drops; it does not promise disk persistence or document recovery.

Admission happens before stack projection. Native error branding and own data descriptors allow already materialized original stacks without invoking getters or `Error.prepareStackTrace`. Lazy stack accessors and arbitrary thrown objects are omitted. Browser-owned error coordinates can provide an original frame. Stack text is bounded before parsing, names and messages are discarded, and only exact trusted artifact locations survive. Eval, sourceURL impersonation, query-bearing URLs and unknown locations are unsupported. A caller-created stack is not evidence of the original failure and must never be substituted.

## Limits and storage

| Limit | Release | Debug |
| --- | --- | --- |
| Frames per incident | 12 | 24 |
| Encoded record | 4 KiB | 8 KiB |
| Main queue | 128 KiB / 256 records | 256 KiB / 512 records |
| Preload queue per generation | 32 KiB / 32 records | 64 KiB / 64 records |
| Transport batch | 16 KiB / 16 records | 16 KiB / 16 records |
| Log segments | 4 × 1 MiB | 4 × 2 MiB |

Each profile additionally permits one 64 KiB incident summary, one 64 KiB replacement temporary and one 4 KiB run marker. No emergency file or synchronous crash write is implemented. The main queue's reserved incident slot is inside its capacity. Separately account for one transport batch, one write batch, a bounded 64 KiB safe report tail and bounded stack-processing scratch space. Debug also records sink state transitions. Repeated events coalesce, queues drop under pressure, and counters saturate.

A single asynchronous writer handles partial writes and fixed-slot rotation. A one-shot timer drains within 250 ms of first pending work under an available event loop; full batches request an earlier drain. Idle diagnostics schedule no periodic work. A lost transport acknowledgement permits no further in-flight sends. Disk failures permanently retire the sink for that run, release its queue and leave bounded safe report memory. No retry loop, fsync, compression, recursive cleanup or dedicated process is used.

Files use private POSIX modes and reject symlink and hardlink leaves. Existing owned files are checked before truncation. User-chosen exports are bounded copies of already safe memory. Windows access-control behavior still needs platform validation; POSIX modes do not establish equivalent Windows permissions.

## Observation and coverage limits

The main observer uses `uncaughtExceptionMonitor`, preserving Electron's existing handlers. On the tested Electron 44.3.0 macOS runtime, ordinary main promise rejections did not enter that monitor. No rejection listener is installed to change that policy. Rejections that reach the runtime exception path can be classified separately. Raw stderr and warning text are never copied into diagnostic files.

Renderer errors and rejections have disposable listeners. The existing React recovery boundary is the primary React observer. Its recovery UI and manual error details remain unchanged. Main observes preload failures independently of the preload bridge, renderer termination and window responsiveness. Owned document/word-count workers report at existing failure owners. Analysis observes only unexpected native process termination, not user-authored analysis failures.

Utility instances receive random diagnostic service names. Electron 44.3.0 delivers these names through `child-process-gone.details.name`; matching is exact and generation-specific. Intentional cleanup is marked immediately before existing termination. Native exit codes are preserved as supplied, including platform wait-status values. The tested runtime omits `child-process-gone` for utility exit zero, so an owned zero-exit listener records unexpected termination without guessing a cause. Nonzero termination has only the native app event as its exit producer.

Native stacks, heap dumps, durable tails and power-loss recovery are not provided. A run marker is marked clean only through final quit lifecycle, with an atomic replacement attempt. That asynchronous attempt may not finish before exit. A later `PREVIOUS_RUN_UNCONFIRMED` record does not distinguish a crash, kill, power loss or incomplete marker write. Document recovery remains governed by its existing journal and native snapshot contracts.

## Verification

Run `npm run check` for integrated validation. Focused diagnostics tests are `node --test --test-concurrency=1 tests/local-diagnostics-*.test.mjs` after `npm run build`. Native tests use disposable profiles and synthetic documents. Fault entrypoints belong only in test fixtures; never expose them through a shipped bridge. Timing tests must use matching integrated builds with a test-only disabled control and must not overlap competing builds or tests. A passing correctness test is not a performance measurement.
