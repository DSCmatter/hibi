# Adding functionality

The `context` passed to `start` connects your addon to Hibi. Use its APIs for commands, editor changes, dialogs, and workspace access. The [AddonContext reference](../addon-api-reference/AddonContext.md) lists them all.

## Change the current document

Add this registration inside `start(context)` to create a command that inserts a heading above the current document.

```typescript
context.commands.register({
  id: 'add-heading',
  label: 'Add a heading',
  run() {
    context.editor.updateMarkdown(source => `# Heading\n\n${source}`)
  },
})
```

The transform receives the current source. Return the replacement text, or `null` to leave it unchanged. For file actions such as saving, use `context.editor.runCommand('save')` so Hibi can handle dialogs and unsaved changes.

`getDocument()` includes `tabId`, `revision`, and `contentVersion`. The revision identifies a replacement editor; the content version advances when text changes, including undo and redo. If you calculate a result asynchronously, compare all three before using it. A matching file name alone does not mean the document is unchanged.

For edits calculated from an earlier snapshot, use `applySourceEdits()` in source view. It validates the version and exact text before applying all changes in one undo operation. Offsets count UTF-16 code units in the complete document source, including frontmatter. Rich view returns `unsupported-view`; navigation position maps must not be used to build edit ranges.

```typescript
const document = context.editor.getDocument()
if (document) {
  const result = context.editor.applySourceEdits({
    requestId: crypto.randomUUID(),
    tabId: document.tabId,
    revision: document.revision,
    contentVersion: document.contentVersion,
    changes: [{ from: 0, to: 0, insert: '# Heading\n\n', expectedText: '' }],
  })
  if (result.status !== 'applied') context.notify(result.message)
}
```

Handle `stale` by calculating a new proposal from the latest snapshot, and `composing` by waiting until text composition finishes. A stopped addon receives `disposed`. Reusing a request ID with different edits is invalid. Retries with the same payload return the original result while it remains in the addon's bounded cache: at most 128 requests and 8 Mi UTF-16 units of serialized payloads. After eviction, the version check still prevents an old content-changing edit from being applied again.

A request can contain up to 256 non-overlapping changes. Each change must include its exact `expectedText`; insertions use an empty string. Edits cannot split a surrogate pair or share an insertion boundary. Inserted and expected text together are limited to 4 Mi UTF-16 units, the serialized request to 8 Mi units, and the resulting document to Hibi's 2 MiB UTF-8 limit. The API retains the current immediate save and recovery path; it does not add a background edit journal.

## Add a toolbar action

Commands and toolbar buttons are separate registrations. Reuse the same function when both should do the same thing.

```typescript
const greet = () => context.notify('Hello.')

context.commands.register({ id: 'greet', label: 'Say hello', run: greet })
context.toolbar.register({ id: 'greet', label: 'Say hello', onClick: greet })
```

Toolbar and status-bar registrations return handles with `update` and `dispose` methods. Update an existing item when its value changes. Status-bar items should show useful state, such as a count, rather than repeat the addon name.

## Read the workspace

Use `context.workspace.index()` for note text and drafts. It returns `null` when no workspace is open. Use `snapshot()` when you also need the export data. Pass a workspace-relative path to `openFile()` to open a document.

## Attach editor behavior

`context.editor.registerRich()` attaches behavior to each visual editor. Its `attach(editor)` callback must return a cleanup function. It can register a ProseMirror plugin, but cannot change the editor schema. `registerSource()` creates a CodeMirror extension for each source editor. See [RichExtension](../addon-api-reference/RichExtension.md) and [SourceExtension](../addon-api-reference/SourceExtension.md).

Throw when an attachment cannot be installed. Hibi displays the failure and keeps that editor read-only until the failing addon is disabled or successfully installed. Already attached rich-editor features are detached if a later attachment fails.

Use `onInput()` to observe typed characters, or `onKeyEvent()` to observe editor key events. These hooks do not receive input from settings, search fields, or dialogs.

## Clean up

Hibi removes registrations made through `context` when the addon stops. Clean up timers, browser listeners, and other resources you create yourself in `stop()`. Editor attachment callbacks must clean up their own resources when their editor is removed.

Document-edit access is revoked before `stop()` runs.

A failed cleanup does not prevent Hibi from attempting the remaining host cleanups. Your own `stop()` should follow the same rule when releasing several resources.

## Native operations

Bundled addons can include a `native.ts` entry implementing [NativeAddon](../addon-api-reference/NativeAddon.md). Call its methods through `context.native.invoke()`. Read-only handlers belong in `queries` and use `context.native.query()`.

Validate each handler's input before using it. Prefer the document, workspace, and export operations on [NativeAddonContext](../addon-api-reference/NativeAddonContext.md) over accepting arbitrary paths. Sideloaded packages cannot add native handlers.
