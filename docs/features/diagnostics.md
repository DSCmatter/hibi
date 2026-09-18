# Diagnostics

Enable **Diagnostics** in **Settings → Addons** to inspect performance. Its settings page shows addon initialization, measured activity, recent stalls, process memory and CPU usage, and runtime versions. Production builds include the plugin, but leave it disabled by default. Development sessions started with `npm run dev` enable it unless you have saved a different choice.

Start with the slowest addon initialization or callback. Initialization is elapsed time and includes module loading and the addon's `start()` function. Async activity also includes time spent waiting, so a long async operation does not necessarily block typing.

Recent stalls show long tasks and frame gaps of at least 50 ms. Matching callbacks ran during the same interval. Unattributed stalls can include rendering or work outside the measured callbacks, such as an addon's own timers. Diagnostics identifies places to investigate; it is not a complete CPU profiler.

The p95 column uses the latest 120 calls per operation. Counts, averages, and maximums cover the retained recording session. **Clear runtime samples** resets these values and the native event-loop samples. Startup timings remain available, including addons that started before you enabled Diagnostics. Disabling the plugin disconnects its observers and stops its timers.

The view retains up to 128 operations and 60 recent stalls. Older inactive operations are removed when that limit is reached.

Memory is shown in MiB. Process readings come from [Electron's process metrics](https://www.electronjs.org/docs/latest/api/structures/memory-info), and main-loop delay comes from [Node's event-loop monitor](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions). Its 20 ms sampling interval contributes to the displayed delay. The first CPU sample is unavailable because it needs an interval to compare. Startup offsets use each process's own clock and should not be added together as a launch-time total.
