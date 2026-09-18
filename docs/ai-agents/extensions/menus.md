# Popover menus

`context.menus.open({ label, anchor, items })` opens the shared app menu. `anchor` is an element or viewport `{ x, y }` point. Each item has a local `id`, `label`, and `onSelect`, with optional `icon`, `disabled`, and `separatorBefore`. The host closes the menu before calling an action and reports callback failures. Callbacks may return promises.

The returned handle provides `close()`. Outside clicks, Escape, and Tab dismiss the menu. Arrow keys and Home/End move among enabled actions. Menus fit within the viewport. Stopping an addon closes its menu and prevents old actions from running.

Workspace rows use this menu with Shift+F10 or the context-menu key. Built-in components use `useMenus` from the shared UI host. Only one menu opens at a time.
