# Startup performance

Run `npm run build`, then `node scripts/benchmark-startup.mjs > startup.json`. `HIBI_BENCH_RUNS` controls repetitions (default five). The report separates a minimal Electron page, fresh profiles, retained-profile relaunches, and macOS window reopening. It measures editor availability, the first displayed keystroke, subsequent typing latency, loaded scripts, and the emitted static dependency graph. The first retained-profile run is reported separately as cache priming.

Measurements use production assets in the test Electron runtime with hidden windows and isolated temporary profiles. Automation adds latency. A fresh profile is **not** an OS cold-cache launch; the script never clears machine caches. Packaged launch measurements and other platforms must be reported separately. Use median and p95; do not promise a launch budget from a single run.

Main and renderer checkpoints use the `hibi:` performance-entry prefix. Entry checkpoints occur **after static imports**, not at OS process launch. Native startup reads have separate durations. Renderer document availability and required editing capabilities are distinct from window painting. No benchmark telemetry leaves the machine.

`out/renderer/startup-bundle.json` records chunk sizes, static/dynamic imports, and module membership. Follow static imports from entry chunks when comparing startup cost; a separate chunk alone does not establish lazy loading.

The `app://` scheme allows V8 code caching. Native addon implementations load on their first authorized call, with shared in-flight imports and a second enabled-state check after loading. Worker entrypoints resolve from the application root so chunk splitting does not change their locations.

Independent native preferences load concurrently. Appearance, protocol security, permission policy, and IPC registration precede navigation; other preference reads overlap renderer loading. IPC waits for those reads before accessing session state or processing edits.

Renderer catalogs import data-only manifests and optional lightweight `flavor-info.ts` descriptors. Implementations load only when enabled. Keep syntax detection separate from nodes, renderers, fonts, and export code so disabled flavors remain discoverable without loading their engines. `Settings.tsx` is a separate lazy boundary; shared runtime preferences belong outside it.

The shell can render before document capabilities finish. Enabled schema, serialization, matching document formats, and input addons must finish `start()` before editing begins. A failed required addon leaves source-only editing available. Unknown API v1 addons keep this conservative behavior. `startup: 'background'` is only for services/UI that do not change editing semantics. Unrelated enabled formats and background services activate at idle after required capabilities; disabling an in-flight addon invalidates its activation and scoped registrations. Existing editors stay mounted and inert during required capability changes.

Built-in code languages retain metadata at startup, cache in-flight and completed parser loads, and update decorations without changing source or undo history. Disabled languages stay disabled even if an import finishes afterward. Async Markdown exports await requested parsers; synchronous API v1 exports may initially contain escaped plain code. Settings, history, and palette UI load on interaction. Palette search mounts settings discovery on demand instead of duplicating control metadata.

Source-editor code may warm during idle, but its editor instance mounts only when a source view is requested. Fonts/layout and async source input extensions finish before source view reports readiness. This avoids constructing an unused editor while retaining import warmup for the first view switch.

Settings remain mounted after their first interaction to retain navigation state. Opening the palette also discovers enabled plugin controls, without loading them at application startup. Casing preferences initialize independently of settings. Initial rich-editor focus is synchronous with mounting; it never schedules a later selection reset over a user's selection. Failed source input extensions display an error with the source read-only until the extension is disabled or loads successfully.
