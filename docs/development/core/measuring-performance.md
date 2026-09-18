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

## Read CI results

The benchmarks workflow publishes results to CodSpeed for pull requests and `main`. It measures core CPU work and desktop elapsed time separately. Shared-runner desktop timings are noisy, so compare repeated results on the same runner configuration.

Keep correctness tests alongside performance work. Faster startup is useful only when the editor accepts input and the workspace list is ready.
