# Toolbar and tooltips

## Adding a toolbar action

`context.toolbar.register(item)` adds an action below the titlebar. The host prefixes local IDs with the addon ID and rejects duplicate or invalid IDs. The returned handle has `update(partial)` and `dispose()`. Disabling, failed startup, and hot reload remove owned actions. Disposed handles and callbacks do nothing. Async callback failures show an error notification.

```ts
import { Volume2 } from 'lucide-react'

const action = context.toolbar.register({
  id: 'sound', label: 'mute sounds', icon: Volume2,
  tooltip: 'mute keyboard sounds', pressed: false,
  onClick() { action.update({ pressed: true }) },
})
```

`when: 'normal'` shows the action in normal and split views. `when: 'source'` shows it in source and split views. Omitting `when` shows it in every editor view. Settings hide the toolbar, and empty toolbars take no space. Icons are optional; icons-only mode uses a puzzle icon when none is supplied. Labels remain accessible.

`hidden: true` hides a contextual action while preserving its settings position. Built-in formatting uses this API too, follows the active pane, and adds table actions when editing a rich-text table. Unavailable actions are disabled. Hiding the toolbar does not disable addons or commands.

## Preferences and layout

`getPreferences()` returns `{ visible, mode, order?, autoHide? }`. `setPreferences(partial)` changes saved window preferences. `mode` accepts `icons`, `icons-and-text`, or `text`.

`order` contains fully qualified IDs such as `format.bold` and `keybeats.mute`. Invalid/duplicate IDs are ignored. Unlisted actions follow registration order; disabled addons keep their saved positions. An empty array restores defaults. Returned arrays are copies.

The host measures button widths and moves overflow into an ellipsis menu in saved order. It adapts to fonts, sidebar width, and display mode without horizontal scrolling. The toolbar's inset surface uses 12 px horizontal and 4 px vertical padding. Individual buttons get backgrounds only when hovered or active. Overflow supports arrow keys, Home/End, Escape, and outside dismissal.

Appearance settings expose visibility, display mode, and **Arrange toolbar actions**. Users can drag tiles, use Earlier/Later buttons, or press Alt+Left/Right on a focused tile. Tiles wrap, and the selected action's position appears below them. The toolbar also supports dragging. Changes save immediately. Reset order preserves display mode and visibility.

## Auto-hide

`autoHide` defaults to true. The toolbar and titlebar share an editor-activity signal and a 1.2-second idle timer, with separate appearance settings. Collapse moves the editor up; expansion moves it back. The toolbar slide uses `--motion-feedback`, with its contents fading out before collapse and in during expansion to avoid clipping.

Hidden bars are inert and excluded from keyboard navigation. Pointer movement near the window top, control focus, find, palette, and settings reveal both bars. Reduced motion disables transitions. The find bar sits below the toolbar and its bottom margin, or directly below the titlebar when no toolbar is shown.

## Showing tooltips

`context.tooltips.show({ anchor, text, placement? })` shows plain text by a DOM element and returns a function that hides that request. `placement` is `top` or `bottom` (default); the host keeps it within the viewport. `hide()` affects only the calling scope. Disabling an addon dismisses its tooltip without closing a newer tooltip owned by another addon.

```tsx
import { Button, Tooltip, useTooltips } from '../ui'

<Tooltip text="export this workspace"><Button>export</Button></Tooltip>

// Built-in imperative usage; addons use context.tooltips instead.
const tooltips = useTooltips()
const hide = tooltips.show({ anchor: buttonElement, text: 'ready to export' })
```

`Tooltip` clones one child without adding a layout wrapper. Custom children must forward data attributes to their DOM element. Shared `Button` and `IconButton` convert `title` into this tooltip; `data-tooltip` also works directly.

Hover waits 400 ms; keyboard focus shows help immediately. Touch does not open hover tooltips. Escape, pointer down, pointer exit, scrolling, resizing, and window blur dismiss them. The tooltip temporarily adds its ID to `aria-describedby`, preserving existing IDs. Text stays inert; markup never executes.

`DialogProvider` mounts one `TooltipHost`. Standalone renderers can mount it explicitly. Native popovers place tooltips above modals without blocking clicks. Colors, corners, motion, and reduced-motion behavior use shared tokens.

See the [toolbar API](../reference/toolbar-api.md) and [tooltip API](../reference/tooltip-api.md).
