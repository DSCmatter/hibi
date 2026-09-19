# Measuring performance

Measure a repeatable flow before changing it. Keep the document, profile, build, and machine the same when comparing results.

The optional [Diagnostics addon](../../features/diagnostics.md) shows per-addon loading and startup times, host-invoked callback timings, renderer stalls, and native process metrics. It defaults on in `npm run dev` and off in production. Disable it when collecting baseline benchmarks: recording itself adds overhead. Saved addon preferences override either default.

Preload begins document, addon, and recent-workspace reads before the renderer mounts. These promises remain independent: the recent list does not wait for addon discovery. Blank startup skips the external-file drain; queued files and a configured startup workspace still use it.

The rich editor caches immutable top-level Markdown blocks for compatible serializers. Changed blocks and their context are rechecked; undeclared serializers keep the full-document path. The outline subscribes only while visible. Document changes cross IPC as ordered replacements rather than complete source strings; see [document persistence](document-persistence.md).

## Core benchmarks

```sh
npm run bench
```

These benchmarks cover core code and default-enabled addons. Add cases to the existing suites under `bench/core` when changing those paths.

## Desktop benchmarks

```sh
npm run build
npm run bench:desktop
```

Desktop benchmarks launch the built app in isolated profiles. They measure startup through editor and workspace-list readiness, the first visible keystroke, opening larger notes, and switching to source view.

Use `npm run bench:startup` for a detailed local launch report. Compare several runs; a single launch can be affected by disk caches or other processes.

Use `node scripts/benchmark-sidebar.mjs 100000` (also `1000` or `10000`) to inspect the shared tree's rendered row count, DOM size, scroll extent and elapsed time through two animation frames. Each run uses the existing production build and a temporary addon/profile. Item metadata is still prepared eagerly. This exploratory probe does not establish percentile latency or physical presentation; preserve before/after output and use repeated controlled runs for timing claims. `tests/sidebar-window.test.mjs` covers far-row keyboard navigation, rename focus, section/row geometry, scroll anchors and retained drag/menu targets.

Use `npm run bench:input` to measure document-changing ProseMirror transactions and count formatting checks and Markdown serializations. First and subsequent keystrokes use the same driver endpoint: sending a key and observing changed editor text. Renderer processing time is reported separately and includes synchronous listeners. Neither measurement proves that pixels reached the display.

`HIBI_INPUT_RUNS=10 npm run bench:input` changes the sample count. Set `HIBI_BENCH_FOREGROUND=1` to focus isolated benchmark windows and include foreground editor behavior. The default keeps test windows hidden; custom caret work may therefore be absent. Benchmark instrumentation is installed by the driver and does not ship with the app.

Set `HIBI_INPUT_ANALYSIS=1` to add a two-second CPU load in an isolated analyzer while measuring typing. The script installs a temporary benchmark-only addon in each disposable profile. Default runs and CodSpeed keep the normal core/default-addon workload.

## Read CI results

The benchmarks workflow publishes results to CodSpeed for pull requests and `main`. It measures core CPU work and desktop elapsed time separately. Shared-runner desktop timings are noisy, so compare repeated results on the same runner configuration.

Keep correctness tests alongside performance work. Faster startup is useful only when the editor accepts input and the workspace list is ready.

Formatting buttons refresh together before the next frame. Document changes and undo remain synchronous. Editor extensions are configured once per editor configuration, and the command list is built when the palette opens. Capability checks still use the current editor state, including selections, tables, and history.

Blank rich-editor startup leaves CodeMirror unloaded. Source view loads its editor on demand, while code fences can load their language parsers independently. Cursor and linked-scroll code use the mounted source view without importing its runtime into the initial renderer bundle.

The rich-editor module starts loading when the active format requires Markdown. Its component is published through ordinary React state, keeping the shell usable during loading and avoiding the first Suspense reveal delay. A late import cannot replace a standalone editor; failed imports use the existing draft-recovery screen. This changes loading presentation, not the editor-ready benchmark predicate. On macOS, `node scripts/benchmark-editor-readiness.mjs /path/to/checkout 8` compares driver readiness with the same predicate stamped by a renderer animation frame across eight window reopens. Use matched production builds and separate profiles; record cold startup and input independently.

Code highlighting maps existing decorations through edits and refreshes the affected block range. Language changes trigger a full refresh. The differential test compares incremental results with full highlighting through text edits, block conversion, deletion, nested blocks, and language changes.

## Document-engine scale measurements

After building, run `node scripts/benchmark-document-engine.mjs --output=/path/to/results.json` for source and visual editing at 1,000, 10,000 and 100,000 logical lines. The defaults use three independent profiles and 1,000 real keystrokes at each of the start, middle and end positions. Keep the machine otherwise idle when comparing revisions. Add `--foreground` for focused windows; hidden-window results do not establish native input or display latency.

Use `--families=markdown,bbcode`, `--sizes=1000,10000`, `--modes=source,visual`, `--runs=1` and `--edits=20` for a smaller exploratory run. The fixture generator also includes plain text, Typst and LaTeX projects, equations, embedded Mermaid diagrams, a connected flowchart, large tables/lists/paragraphs/code blocks, Unicode, mixed line endings and malformed content. It records exact source size and line count, generated region groups, resources, and actual diagram node/edge counts. Runtime rich-model and DOM counts are measured separately. A padded text fixture is not evidence of diagram-layout scalability.

The driver waits for a constant-size content-version acknowledgement after each key. Full-source and native-recovery comparisons happen outside the timed loop. Dispatch CPU, source commitment, first usable editor, next-frame delay, driver latency and memory are separate fields; none claims physical presentation. Existing size-limit rejections and missing visual capabilities are recorded rather than bypassed or counted as passing. Each case has an owned-process deadline; `--deadline=45000` can shorten it for exploratory runs. Reports are saved after each case, including errors and timeouts. Use a new output filename for each run to preserve history.
