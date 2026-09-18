# block dragging

enable **block dragging** in settings → addons. hover a rich-text block to reveal its grip, then drag it to a new position. works in normal view and the rich side of split view, including nested list items. source-only views keep their normal text selection behavior. disabled by default.

click the grip to open the shared **block actions** menu, with **move block up/down** as keyboard-operable alternatives. the same commands work from the command palette at the current rich-editor selection. moves preserve the block's formatting and participate in ordinary undo/redo. moves that would violate the document schema are disabled. read-only editors cannot move blocks; disabling the addon removes its handle, menu, event listeners, and editor plugin without rebuilding document history.

## credits

hibi integration: may. drag targeting and native drag/drop use the MIT-licensed [tiptap drag handle](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle) and ProseMirror. their notices remain in hibi's open source licenses. the integration uses the existing `registerRich`, shared menu, and scoped style APIs.
