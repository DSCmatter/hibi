# Settings and sidebar views

Use Hibi's shared controls so your addon follows the app's spacing, colors, and keyboard behavior.

## Add a settings page

An addon can provide a `Settings` component. Hibi supplies the page title, description, metadata, and readme button. Put your controls inside the component without repeating that heading.

This local example stores a greeting for the command from the first guide. Rename `index.ts` to `index.tsx` to use JSX.

```tsx
import { useState } from 'react'
import { defineAddon } from '../../addons/api'
import { SettingRow, TextInput } from '../../addons/ui'
import manifest from './manifest'

const key = 'hello.greeting'
const greeting = () => localStorage.getItem(key) ?? 'Hello.'

function Settings() {
  const [value, setValue] = useState(greeting)
  return (
    <SettingRow id="hello-greeting" label="Greeting">
      <TextInput
        id="hello-greeting"
        value={value}
        onChange={event => {
          setValue(event.target.value)
          localStorage.setItem(key, event.target.value)
        }}
      />
    </SettingRow>
  )
}

export default defineAddon({
  manifest,
  Settings,
  start(context) {
    context.commands.register({
      id: 'greet',
      label: 'Say hello',
      run: () => context.notify(greeting()),
    })
  },
})
```

Prefix stored keys with your addon ID. Shared `SettingRow` controls are discoverable through settings search and the command palette. Settings may mount in the background for discovery, so avoid starting work merely because the component mounted.

## Add a sidebar view

Register a [SidebarView](../addon-api-reference/SidebarView.md) inside `start`. The view appears in the sidebar picker and command palette.

```tsx
const view = context.sidebar.register({
  id: 'notes',
  label: 'My notes',
  Content: () => <p>Your addon content goes here.</p>,
})

context.commands.register({
  id: 'open-notes',
  label: 'Open my notes',
  run: () => view.open(),
})
```

Content mounts only while the view is visible. Keep anything that must survive closing the sidebar in addon state. Use the shared [Sidebar](../addon-api-reference/Sidebar.md) component for lists and trees.

## Open a dialog

Use `context.dialogs.prompt()` for a text value or `confirm()` for a decision. For custom content, use `open()` with a React component and choose `size: 'wide'` when needed. The [dialog API](../addon-api-reference/DialogApi.md) handles dismissal and returns the result.
