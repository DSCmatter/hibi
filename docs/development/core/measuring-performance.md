# Measuring performance

Measure a repeatable flow before changing it. Keep the document, profile, build, and machine the same when comparing results.

## Core benchmarks

```sh
npm run bench
```

These benchmarks cover core code and default-enabled plugins. Add cases to the existing suites under `bench/core` when changing those paths.

## Desktop benchmarks

```sh
npm run build
npm run bench:desktop
```

Desktop benchmarks launch the built app in isolated profiles. They measure startup through editor and workspace-list readiness, the first visible keystroke, opening larger notes, and switching to source view.

Use `npm run bench:startup` for a detailed local launch report. Compare several runs; a single launch can be affected by disk caches or other processes.

Use `npm run bench:input` to measure document-changing ProseMirror transactions and count formatting checks and Markdown serializations. First and subsequent keystrokes use the same driver endpoint: sending a key and observing changed editor text. Renderer processing time is reported separately and includes synchronous listeners. Neither measurement proves that pixels reached the display.

`HIBI_INPUT_RUNS=10 npm run bench:input` changes the sample count. Set `HIBI_BENCH_FOREGROUND=1` to focus isolated benchmark windows and include foreground editor behavior. The default keeps test windows hidden; custom caret work may therefore be absent. Benchmark instrumentation is installed by the driver and does not ship with the app.

## Read CI results

The benchmarks workflow publishes results to CodSpeed for pull requests and `main`. It measures core CPU work and desktop elapsed time separately. Shared-runner desktop timings are noisy, so compare repeated results on the same runner configuration.

Keep correctness tests alongside performance work. Faster startup is useful only when the editor accepts input and the workspace list is ready.

Formatting buttons refresh together before the next frame. Document changes and undo remain synchronous. Editor extensions are configured once per editor configuration, and the command list is built when the palette opens. Capability checks still use the current editor state, including selections, tables, and history.

Blank rich-editor startup leaves CodeMirror unloaded. Source view loads its editor on demand, while code fences can load their language parsers independently. Cursor and linked-scroll code use the mounted source view without importing its runtime into the initial renderer bundle.
