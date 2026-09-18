# Releases and publishing

Hibi uses AGPL-3.0-only. Packaged applications include the root `LICENSE`.

## Nightly builds

The `nightly` workflow runs from `main` daily at 18:00 UTC (02:00 Manila time), subject to GitHub scheduling delays. To run it manually, choose Actions → nightly → Run workflow. Unchanged revisions are skipped.

Each release gets a `nightly-YYYY-MM-DD-<commit>` tag and prerelease version. Its changelog links commits since the previous reachable nightly tag. The first nightly starts at the most recent reachable release tag, or includes all history if none exists. Release notes do not create a source commit.

Four jobs run `npm run check` before packaging:

- Linux x64: AppImage.
- Windows x64: NSIS installer.
- macOS Apple Silicon: DMG and ZIP.
- macOS Intel: DMG and ZIP.

Publication waits for all platforms. The prerelease contains installers and `SHA256SUMS.txt`; temporary Actions artifacts expire after one day. Failed uploads leave a draft for retry. Runs are serialized, the source commit is fixed before builds start, and tags are never force-moved.

Notes start with the short source SHA, a backup warning using GitHub's `:warning:` emoji, and direct Windows, macOS Intel, and Linux AppImage links. Every download, including Apple Silicon and ZIP files, gets a linked SHA256 entry. Changes follow the downloads.

Packages use `com.ryanaque.hibi`, the icons in `electron-builder.yml`, and the regular app's data profile. Save and back up documents before installing. Windows packages are unsigned. macOS packages use ad-hoc signing without notarization. Trusted distribution signing requires separate credentials.

The workflow uses the repository token; only publication has `contents: write`. No extra secret is required. Test changelogs with `node --test tests/nightly.test.mjs` and check workflow syntax with `actionlint`.

Nightlies share regular CI's incremental checks and cache. A manual `clean` run ignores caches and runs every test, even on an unchanged revision. It leaves an existing published release and its assets intact.

## Website addon catalog

`.github/workflows/addons-sync.yml` runs when a push to `main` changes `src/addons/**`, or on manual dispatch. `node scripts/export-addons.mjs` copies `authors.ts`, manifests, Markdown, and images into `out/addons`, preserving relative paths. It excludes runtime TypeScript, CSS, audio, hidden files, and symlinks. Manifests are copied without execution.

The workflow replaces generated catalog files in `hibigarden/site/addons`, removes stale files, and preserves `addons/index.html`. After the site's tests and build pass, it commits `chore(addons): sync to main (<source short commit id>)`. Unchanged data creates no commit. Runs are serialized and use normal pushes, preserving concurrent site work.

Set `ADDONS_SYNC_TOKEN` in **schmayterling/hibi**, with access to `hibigarden/site` and Contents read/write permission. The source workflow cannot read a secret stored in the destination repository.

Documentation publishes separately through `docs-sync.yml`, only when `docs/**` changes on `main`. See [documentation publishing](validation.md#documentation-publishing) for setup.
