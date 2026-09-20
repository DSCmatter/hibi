# Input lag checkpoint — 2026-09-20

Stopped after the current measurement at the user's request. **The latency goal remains unmet.** This checkpoint preserves results and unfinished work; it does not complete the document-engine mission.

## Result

- Hibi: 14 of 16 cases passed input/save/history/selection/scroll checks and trace export. All eight 100k-word cases completed. Both 100k-character split-source cases failed initial caret visibility before input; those cases have no usable timing, history result, or trace.
- Minimal native engines: all eight 100k-word cases passed. Matching fixture hashes were verified across Hibi and bare cases.
- Split-visual with one giant 100k-word paragraph remains severely delayed: sustained visible-check p99 was 2,814 ms for insertion and 7,559.1 ms for backspace. Preserving input is not a latency pass.
- Completed Hibi captures exported in 13.04–25.22 seconds; bare captures in 11.88–15.35 seconds. No trace-finalization failures occurred in these completed cases.

## Caret-only follow-up

At the user's request, only the failed caret setup was fixed after the checkpoint above. The source benchmark now focuses its pane before dispatching selection and scrolling: the synchronous source-caret event therefore gives split-scroll leadership to source instead of the previously focused rich pane. Setup waits for the exact requested position, focus and viewport containment, with a five-second timeout and retained failure geometry. It does not retry scrolling or relax assertions. A quick pre-fix rerun passed, confirming the original failure was intermittent rather than guaranteed on every launch.

Both original failed cases now pass the full sustained check in `/tmp/hibi-caret-setup-fixed/summary.json` (harness SHA-256 `171e6cff5e2a9cc1908cd270435931d3b73d8dacb84cc84d0a317baa03f32a14`):

| Split-source, 100k characters | Initial head | Caret top/bottom | Viewport top/bottom | Result |
| --- | --- | --- | --- | --- |
| Paragraphs | 50000 | 376.72 / 393.72 | 82 / 688 | Passed |
| Giant paragraph | 50000 | 376.44 / 393.44 | 82 / 688 | Passed |

Each case completed 900 insertions and 900 backspaces over separate 30-second holds, with exact immediate saves, selection/scroll checks, undo to original, redo to final, and successful trace export. Command: `node scripts/trace-input-paint.mjs --engine hibi --fixed-chrome --background --mode split --target source --size chars --shape all --continue-on-error --out /tmp/hibi-caret-setup-fixed`.

Scoped lint, JavaScript syntax, documentation checks and independent review passed. `npm run check` was attempted but stopped at an existing formatter error in untouched `src/addons/git/native.ts`; the full suite did not run. Product code and the remaining latency issues were not changed. The historical matrix above retains its original failures; these two successful cases are a separate follow-up capture.

## Provenance and method

Hibi capture: `/tmp/hibi-app-sustained-fix10/summary.json`, product commit `0ccf2f099265f1b4ca774a56b8a83fa264456597`. Harness SHA-256: `f89932f96bab738a03a70c09b06e2561fe5ccd551ca6ce495c24b3a513834463`.

Bare capture: `/tmp/hibi-bare-floor-sustained-fix9/summary.json`, commit `c1e9d50f0016827385558dcf4c45e7b8e35f9aef`. Harness SHA-256: `3e644ec7a2abbe8f3f5923b881488126f03844e898cb4ae2a6170f7a574ed08c`.

Both used `--fixed-chrome --background --mode all --shape all`, with Hibi `--size all` and bare `--size words`. The window was visible but inactive, nonfocusable, and CDP-focus-emulated, with background throttling disabled. These runs did not take the user's keyboard focus. The harness revision between runs only records trace categories and adds `toplevel` to optional CPU-profile captures; these runs used the same default latency categories. Bare engine fixture files were unchanged. Foreground spot checks remain outstanding.

Each successful case placed the caret in the viewport, waited two seconds, inserted one first-after-idle character, dispatched 900 `s` inputs over 30 seconds and 900 backspaces over 30 seconds, then checked selection, scrolling, exact save, undo to the original document, and redo to the final document. This uses native browser input, not physical keyboard autorepeat. Split-source and split-visual name the active pane. The other bare split pane is static and inert.

The bare floor uses CodeMirror with history, keymaps, selection and wrapping but no optional language/highlighting; ProseMirror uses a minimal paragraph/text schema with native history/keymaps. Font and pane geometry match the application. Bare “save” means a runner-written engine snapshot, not Hibi IPC or recovery. A separate configured Markdown baseline in `/tmp/hibi-bare-sustained-fix9` had one giant source input-dispatch timeout; it must not be presented as the minimal editing floor or a successful case.

All triples below are **p50 / p95 / p99 in milliseconds**, nearest-rank, 900 samples per sustained phase. A visible check verifies the changed text/caret rectangle in an animation-frame callback; the next-frame measurement is the following callback. Neither proves physical presentation or guarantees an after-paint boundary. Frame callbacks may coalesce during stalls. Do not subtract percentile columns to infer component costs. See [measurement definitions](../../development/core/measuring-performance.md).

## 100k words: sustained visible checks

| Active mode | Shape | Hibi insertion | Bare insertion | Hibi backspace | Bare backspace |
| --- | --- | --- | --- | --- | --- |
| Source | Paragraphs | 9.3 / 10.2 / 11.8 | 4.9 / 6.1 / 7 | 7.3 / 8.1 / 29.2 | 16.9 / 18.1 / 18.3 |
| Visual | Paragraphs | 19.3 / 20.9 / 28.6 | 9.1 / 10.5 / 17.3 | 19.6 / 20.4 / 27.6 | 8.5 / 9.9 / 15.9 |
| Split-source | Paragraphs | 22.7 / 23.7 / 25 | 13.9 / 14.9 / 16.4 | 31 / 32.4 / 32.7 | 15.4 / 16.3 / 16.6 |
| Split-visual | Paragraphs | 29.7 / 31.5 / 33.2 | 11 / 13 / 21 | 30.6 / 33.3 / 45.2 | 13.4 / 14.8 / 15.3 |
| Source | Giant paragraph | 18.1 / 19.3 / 20 | 12 / 12.9 / 13.3 | 11.7 / 12.4 / 22.7 | 7.9 / 20.2 / 20.7 |
| Visual | Giant paragraph | 31 / 35.4 / 70 | 19.6 / 20.7 / 21.5 | 30.5 / 33.1 / 40.1 | 20.3 / 21.5 / 32 |
| Split-source | Giant paragraph | 23.9 / 25.1 / 37.7 | 11.4 / 24.4 / 25.4 | 25.1 / 34.4 / 34.7 | 12.7 / 13.7 / 14 |
| Split-visual | Giant paragraph | 327.4 / 2213.7 / 2814 | 29.1 / 31.5 / 74.5 | 4413.1 / 7024.5 / 7559.1 | 30.2 / 32 / 33.3 |

## 100k words: following frame opportunity

| Active mode | Shape | Hibi insertion | Bare insertion | Hibi backspace | Bare backspace |
| --- | --- | --- | --- | --- | --- |
| Source | Paragraphs | 25.3 / 26.3 / 26.7 | 21.1 / 22.2 / 22.8 | 21.9 / 23 / 40.5 | 33.1 / 34.2 / 34.4 |
| Visual | Paragraphs | 30.8 / 31.8 / 36.3 | 21.5 / 22.5 / 27.7 | 30.1 / 31.1 / 39.5 | 24.6 / 25.7 / 26.5 |
| Split-source | Paragraphs | 39 / 39.9 / 40.3 | 29.9 / 30.9 / 31.4 | 47 / 52.5 / 53.1 | 31.3 / 32.3 / 32.6 |
| Split-visual | Paragraphs | 36 / 37.7 / 39.5 | 23.6 / 24.7 / 28.6 | 37.2 / 39 / 63.1 | 27.9 / 29 / 29.2 |
| Source | Giant paragraph | 34.4 / 35.9 / 36.6 | 28.3 / 29.2 / 29.6 | 25.8 / 26.8 / 36.9 | 20.3 / 40.1 / 41.5 |
| Visual | Giant paragraph | 34.9 / 64.2 / 95.8 | 22.6 / 36.3 / 50.9 | 34.9 / 37.6 / 48.7 | 32.3 / 33.4 / 35.3 |
| Split-source | Giant paragraph | 40.2 / 41.3 / 47.1 | 24.5 / 43.8 / 44.8 | 34.7 / 57.4 / 58 | 29 / 30 / 30.4 |
| Split-visual | Giant paragraph | 605.9 / 3311.5 / 3978.3 | 30.5 / 33.1 / 81.3 | 8743.8 / 11790.8 / 12424.5 | 31.5 / 33.2 / 34.5 |

## 100k words: queue versus model observation

“Queue” is the supplied event timestamp to the renderer keydown listener. “Model interval” is that listener to the completed native editor model observation. These are elapsed intervals, not pure CPU time: the second includes browser editing/event work as well as application work. The default latency traces do not record all top-level tasks, so unaccounted intervals cannot be declared idle. The analyzer now attributes recorded script/layout/paint/task intervals separately both while input is queued and after keydown; use a separate matched `--cpu-profile` capture for fuller attribution.

| Active mode | Shape | Insertion queue | Insertion model interval | Backspace queue | Backspace model interval |
| --- | --- | --- | --- | --- | --- |
| Source | Paragraphs | 2.7 / 3 / 5.8 | 3.5 / 3.9 / 4.1 | 3.3 / 3.7 / 17.9 | 3.3 / 3.9 / 4.2 |
| Visual | Paragraphs | 10.1 / 10.7 / 12.7 | 6.1 / 6.8 / 7.7 | 10.4 / 10.8 / 12.7 | 6.2 / 6.7 / 7.7 |
| Split-source | Paragraphs | 14.2 / 14.4 / 14.5 | 3 / 3.5 / 3.7 | 14.8 / 15.3 / 17.4 | 3.7 / 4.3 / 4.6 |
| Split-visual | Paragraphs | 15.2 / 15.6 / 15.8 | 6.2 / 6.9 / 7.6 | 15.5 / 16 / 25.6 | 6.1 / 7.1 / 8.5 |
| Source | Giant paragraph | 3.7 / 4 / 4.3 | 6.9 / 7.5 / 7.7 | 3.9 / 4.3 / 10.1 | 7.2 / 7.8 / 8.3 |
| Visual | Giant paragraph | 11 / 12.7 / 29.2 | 17.4 / 19.6 / 22.2 | 11.3 / 12.7 / 16 | 17.3 / 19 / 21.4 |
| Split-source | Giant paragraph | 16.2 / 16.5 / 23.4 | 6.2 / 6.9 / 7.9 | 16.8 / 17.2 / 17.5 | 6.7 / 7.3 / 7.6 |
| Split-visual | Giant paragraph | 142.8 / 1057.4 / 1813.6 | 23.5 / 41 / 65.3 | 2419.7 / 2689 / 3072.6 | 25.6 / 40.2 / 68.8 |

## First key after idle and stalls

First-key figures are single observations after a two-second idle, not percentiles. Stall counts are visible checks over 50 ms / over 100 ms, out of 900 in each phase.

| Active mode | Shape | Hibi first visible | Bare first visible | Hibi insertion stalls | Hibi backspace stalls |
| --- | --- | --- | --- | --- | --- |
| Source | Paragraphs | 25.5 | 15.8 | 1 / 0 | 2 / 1 |
| Visual | Paragraphs | 46.6 | 21.9 | 1 / 0 | 1 / 0 |
| Split-source | Paragraphs | 38.6 | 20.8 | 0 / 0 | 0 / 0 |
| Split-visual | Paragraphs | 57.3 | 23.6 | 0 / 0 | 8 / 1 |
| Source | Giant paragraph | 29.8 | 16.7 | 0 / 0 | 0 / 0 |
| Visual | Giant paragraph | 67.8 | 36.4 | 15 / 4 | 1 / 0 |
| Split-source | Giant paragraph | 34.1 | 22.9 | 3 / 0 | 0 / 0 |
| Split-visual | Giant paragraph | 78.9 | 57.9 | 897 / 792 | 900 / 899 |

## Separate 100k-character coverage

These are Hibi visible-check triples. Failed setup is unavailable, not zero or a latency pass.

| Active mode | Shape | Insertion | Backspace |
| --- | --- | --- | --- |
| Source | Paragraphs | 12.7 / 13.8 / 14.3 | 8.9 / 10 / 19.1 |
| Visual | Paragraphs | 10.7 / 11.4 / 11.8 | 24.3 / 26.5 / 26.8 |
| Split-source | Paragraphs | Unavailable: caret outside viewport | Unavailable |
| Split-visual | Paragraphs | 21.2 / 32.1 / 32.9 | 22.3 / 24.2 / 31.6 |
| Source | Giant paragraph | 14.1 / 15.1 / 15.5 | 11.9 / 12.9 / 13.2 |
| Visual | Giant paragraph | 24 / 25.1 / 25.9 | 19.7 / 20.7 / 21 |
| Split-source | Giant paragraph | Unavailable: caret outside viewport | Unavailable |
| Split-visual | Giant paragraph | 24.9 / 27 / 28.1 | 24.2 / 26.6 / 36.2 |

The failed source caret was focused but offscreen: paragraph top 42,383.9 px with scrollTop 0; giant top 24,799.6 px with scrollTop 10; viewport top/bottom 82/688 px. Investigate placement/scroll behavior before repeating these cases; do not weaken the visibility assertion.

## Changes saved at this checkpoint

- `56e0d9a`: audited inactive rich previews yield to source typing; canonical edits, history, recovery and saves remain synchronous. Pending previews flush before rich interaction. Word count uses only matching native snapshots; addon version 1.1.1.
- `06c8137`, `c1e9d50`, `867176c`: matched native-engine harness, explicit minimal versus Markdown-configured baselines, single-owner bounded trace finalization, and optional top-level task attribution.
- `0ccf2f0`: real source and rich IME candidates remain one undo step across pauses and selection-only candidate updates. Separate compositions and normal selection still create appropriate history boundaries.
- Final analyzer change: timestamp-aligned queue-window attribution, with missing/negative timestamps left unavailable and synthetic regression coverage.

Commit IDs above identify measured pre-rebase revisions; rebasing for delivery may replace them. Raw captures remain local under `/tmp`; only this compact evidence and tooling belong in git.

## Verification and remaining work

- Full `npm run check`: 624/624 passed for the pre-IME production checkpoint (`/tmp/hibi-input-fix9-full-check.log`). This is not a full-suite result for the later IME changes.
- IME checkpoint: build plus eight focused checks passed (`/tmp/hibi-ime-selection-fixed.log`); independent review found no remaining actionable issue.
- Collector: six focused tests passed. Analyzer self-test, scoped formatter/lint, documentation link/reference check and whitespace check passed for the final analyzer change.
- Final full suite after IME, supplied-file rerun and foreground spot checks were not started because the user requested stopping at this checkpoint. The supplied `copy (test).md` remains untouched; its protected reference/footnote content does not support visual editing in the current implementation.

Next work, if resumed:

1. Investigate the two 100k-character split-source caret-placement failures and rerun them without relaxing the assertion.
2. Attribute the severe split-visual giant-paragraph backlog. Rich edits still synchronously update the inactive CodeMirror view through the document-session operation subscriber. Measure that share before choosing a bounded delayed mirror; preserve source-command, focus, selection, geometry and save correctness.
3. Measure remaining active visual native DOM reconciliation/layout costs against the minimal ProseMirror floor. An unmeasured public inline-decoration chunk prototype exists only at `/tmp/hibi-rich-chunk-probe`; regenerate it against the current harness before any future experiment. It is not production code or a proven fix.
4. Complete matched script/layout/queue attribution, supplied-file and foreground checks, then the final full suite. Do not call requestAnimationFrame or microtasks after-paint guarantees.

Rust ports, new format editing and optional storage work remain deferred. Other P0–P11 mission stages remain incomplete.
