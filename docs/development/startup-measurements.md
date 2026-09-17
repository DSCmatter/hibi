# Startup measurements — September 18, 2026

## Conditions

Baseline application: `725b421`. Optimized application: `1cd2bae`. Both ran the same final benchmark script against production builds on macOS arm64, Node v22.23.2, Electron 44.3.0. Profiles were isolated; windows were hidden. Availability polling ran on animation frames, and the keystroke probe checked that displayed text changed. These are local automation measurements, not signed-app or OS cold-cache launch measurements.

Each main scenario used five runs. Retained-profile results exclude the first priming run. With this small sample, reported p95 is effectively the slowest sample. The minimal Electron control's median changed from 375.3 to 397.0 ms, demonstrating environmental variation. Treat timing differences as observations to reproduce, not guaranteed budgets.

## Loading and readiness

Initial static JavaScript fell from **2,195,715 to 1,394,978 bytes (36.5% smaller)**. This follows static imports from renderer entry chunks; dynamically activated features are additional. Regression tests inspect parsed scripts to verify disabled addon engines, unused language parsers, and closed settings are absent.

The hidden source editor mounted in all five baseline blank-note samples and none of the optimized samples. Its module can still prewarm at idle.

All times below are milliseconds, written as **median / p95**.

| Scenario | Runs | Before | After |
| --- | ---: | ---: | ---: |
| Fresh profile | 5 | 592.4 / 630.0 | 566.8 / 579.3 |
| Retained profile, after priming | 4 | 578.9 / 601.9 | 531.2 / 642.5 |
| Window reopen | 5 | 271.6 / 278.5 | 264.6 / 272.3 |
| Open 180-paragraph note | 5 | 102.9 / 106.3 | 78.3 / 78.6 |
| Open 80-fence code note | 5 | 64.3 / 83.7 | 62.8 / 75.1 |
| First source-view switch after code-heavy note | 5 | 203.1 / 208.8 | 266.0 / 546.5 |

Document-open measurements start after process launch. Source switching uses the native shortcut and waits for input readiness and the view transition to finish, excluding titlebar hover/reveal delays.

## Input latency

| Document | First displayed keystroke p95, before → after | Subsequent typing p95, before → after |
| --- | ---: | ---: |
| Blank note | 67.7 → 37.4 | 18.8 → 14.7 |
| Code-heavy note | 53.0 → 19.7 | 19.1 → 16.5 |

Import-only source warmup reduces unused startup work, with a **slower first source-view switch**. The retained-profile p95 also increased in this sample despite its lower median. These tradeoffs remain visible in the table.

With math, Typst, Vim, and graph enabled, three additional runs completed all scenarios: fresh-profile availability was 592.5 / 598.5 ms, first-key p95 23.1 ms, and first source-switch 553.4 / 561.8 ms. Required input/schema initialization remained gated.

## Verification and limits

- `npm run check`: 127 passing tests, including async activation cancellation, input readiness, parser loading, settings discovery, document preservation, and native exports.
- macOS packaging succeeded. An isolated harness exercised packaged ASAR startup and lazy MDX, LaTeX PDF, and Typst SVG compilation.
- Installed-app launch timing, OS cold-cache runs, Windows/Linux timings, and memory profiling were not measured.

See [the performance guide](performance.md) for reproduction commands and lifecycle rules.
