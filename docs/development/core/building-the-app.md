# Building the app

Create an unpacked application for your platform with:

```sh
npm run package
```

Create distributable packages with:

```sh
npm run dist
```

Build output goes to `release/`. Packaging settings live in `electron-builder.yml`.

## Nightly builds

The **nightly** GitHub Actions workflow builds Linux AppImage, Windows installer, and macOS Intel and Apple Silicon packages. It runs checks before publishing a prerelease with download hashes and a changelog. Run it manually from Actions when you need a new build; unchanged revisions are normally skipped.

Windows packages are unsigned. macOS packages use ad-hoc signing without notarization. Distribution signing requires separate credentials.

## Update icons

Replace `build/icon.png`, then run `npm run icons` on macOS. Commit the generated platform icons with the source image so local and release builds use the same artwork.
