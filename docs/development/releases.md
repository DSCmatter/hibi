# Nightly releases

The `nightly` GitHub Actions workflow runs from `main` daily at 18:00 UTC (02:00 Manila time). It can also be started from Actions → nightly → Run workflow. GitHub may delay scheduled runs. Unchanged revisions are skipped.

Each release has a dated `nightly-YYYY-MM-DD-<commit>` tag and a prerelease version. Its changelog lists actual commits since the previous reachable nightly tag, with commit and comparison links. The first nightly includes history since the most recent reachable release tag, or all commits if none exists. Notes live with the release, so publishing does not create another source commit.

Four native build jobs run `npm run check` before packaging:

- Linux x64: AppImage.
- Windows x64: NSIS installer.
- macOS Apple Silicon: DMG and ZIP.
- macOS Intel: DMG and ZIP.

Publication waits for every platform. Installers and `SHA256SUMS.txt` are attached to a GitHub prerelease; temporary Actions artifacts expire after one day. Failed uploads leave a draft for a workflow retry. Runs are serialized, and release tags are never force-moved. The built source commit is fixed before platform jobs start.

All packages retain `com.ryanaque.hibi` and the Hibi icons from `electron-builder.yml`. Nightlies use the regular installed app's data profile. Save and back up documents before installing them. Windows packages are unsigned; macOS packages use ad-hoc signing without notarization. Trusted distribution signing requires separately configured signing credentials.

The workflow uses the repository's built-in token; only the publication job has `contents: write`. No additional secret is needed. To check changelog generation locally, run `node --test tests/nightly.test.mjs`; workflow syntax is checked with `actionlint`.
