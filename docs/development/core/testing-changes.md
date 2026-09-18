# Testing changes

Run the complete check before submitting a change:

```sh
npm run check
```

It checks formatting, generated references, documentation links, UI copy, types, production builds, and tests. Fix failures in the changed behavior before committing.

## Run a focused check

After a build, run a test file directly while working on one feature:

```sh
npm run build
node --test tests/workspace.test.mjs
```

Rebuild after changing app code. Tests load the production output from `out/`.

Electron tests use temporary profiles and fixtures. Import the launcher from `tests/electron.mjs` so local test windows remain hidden. Close each app during cleanup and never point a test at your working notes or normal profile.

## Check the interface

For a UI change, exercise it in the app. Check narrow windows, keyboard navigation, light and dark appearance, and reduced motion when relevant. A passing type check does not confirm spacing or focus behavior.

## Incremental CI

GitHub Actions checks pull requests and pushes to `main`. It reuses successful build output and selects tests using the changed files and their dependencies. Unknown inputs or missing history trigger a full check.

Run `npm run check:ci` to use the same selection locally. Set `CI_CLEAN=true` or choose the workflow's **clean** option to ignore cached results and run everything. `npm run check` always runs the full local suite.
