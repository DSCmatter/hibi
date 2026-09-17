# Startup performance

Run `npm run build`, then `node scripts/benchmark-startup.mjs > startup.json`. `HIBI_BENCH_RUNS` controls repetitions (default five). The report separates a minimal Electron page, fresh profiles, retained-profile relaunches, and macOS window reopening. It measures editor availability, the first displayed keystroke, subsequent typing latency, loaded scripts, and the emitted static dependency graph. The first retained-profile run is reported separately as cache priming.

Measurements use production assets in the test Electron runtime with hidden windows and isolated temporary profiles. Automation adds latency. A fresh profile is **not** an OS cold-cache launch; the script never clears machine caches. Packaged launch measurements and other platforms must be reported separately. Use median and p95; do not promise a launch budget from a single run.

Main and renderer checkpoints use the `hibi:` performance-entry prefix. Entry checkpoints occur **after static imports**, not at OS process launch. Native startup reads have separate durations. Renderer document availability and required editing capabilities are distinct from window painting. No benchmark telemetry leaves the machine.

`out/renderer/startup-bundle.json` records chunk sizes, static/dynamic imports, and module membership. Follow static imports from entry chunks when comparing startup cost; a separate chunk alone does not establish lazy loading.
