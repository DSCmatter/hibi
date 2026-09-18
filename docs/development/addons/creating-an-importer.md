# Create an importer

Importers convert exported files before the core writes them into a workspace. They are currently available to bundled native addons. Installed renderer-only addons cannot register native import handlers.

Add an `importer` field to the manifest with `sources: ['folder', 'zip']` and short `instructions`. The addon appears in the Import dialog while enabled. Its renderer entry can use an empty `start` method if it needs no other UI.

In `native.ts`, provide an asynchronous `import(files)` function. Each `ImportFile` contains a relative `path` and `Uint8Array` `data`. Return `{ files, warnings }`; warnings are optional messages shown after a successful import. Preserve attachments and relative links when changing paths.

```typescript
import type { NativeAddon } from '../api'

export default {
  id: 'my-importer',
  methods: {},
  async import(files) {
    return { files: [...files] }
  },
} satisfies NativeAddon
```

Core owns the file picker, source limits, archive validation, destination selection, and file writes. It validates converter output again before creating a new folder. Keep conversions in memory; do not execute imported content or modify the source export. Test path traversal, duplicate names, malformed exports, and links as well as successful imports.

See [NativeAddon](../addon-api-reference/NativeAddon.md), [ImportFile](../addon-api-reference/ImportFile.md), and the bundled importer addons for working examples.
