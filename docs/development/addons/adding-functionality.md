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

Use `onInput()` to observe typed characters, or `onKeyEvent()` to observe editor key events. These hooks do not receive input from settings, search fields, or dialogs.

## Clean up

Hibi removes registrations made through `context` when the addon stops. Clean up timers, browser listeners, and other resources you create yourself in `stop()`. Editor attachment callbacks must clean up their own resources when their editor is removed.

## Native operations

Bundled addons can include a `native.ts` entry implementing [NativeAddon](../addon-api-reference/NativeAddon.md). Call its methods through `context.native.invoke()`. Read-only handlers belong in `queries` and use `context.native.query()`.

Validate each handler's input before using it. Prefer the document, workspace, and export operations on [NativeAddonContext](../addon-api-reference/NativeAddonContext.md) over accepting arbitrary paths. Sideloaded packages cannot add native handlers.
