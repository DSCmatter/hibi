import type {
  AddonView,
  AddonViewProps,
  ViewInstance,
  ViewRegistration,
} from '../../addons/api'
import type { DocumentState } from '../../shared/desktop'
import { editorDocument } from './document-formats'

type Environment = {
  openSidebar: (id: string) => void
  closeSidebar: () => void
  focusDocument: (tabId: string) => Promise<boolean>
}
export type RegisteredView = AddonView & {
  owner: string
  environment: Environment
}
export type ViewEntry = {
  id: string
  definition: RegisteredView
  input: unknown
  binding: AddonViewProps['binding']
  document: Readonly<DocumentState> | null
  handle: ViewInstance
}
const definitions = new Map<string, RegisteredView>()
const instances = new Map<string, ViewEntry>()
const listeners = new Set<() => void>()
let activePanel: string | null = null
let activeSidebar: string | null = null
let focusTarget: string | null = null
let snapshot: {
  definitions: RegisteredView[]
  instances: ViewEntry[]
  activePanel: string | null
  activeSidebar: string | null
  focusTarget: string | null
} = { definitions: [], instances: [], activePanel, activeSidebar, focusTarget }
const publish = () => {
  snapshot = {
    definitions: [...definitions.values()],
    instances: [...instances.values()],
    activePanel,
    activeSidebar,
    focusTarget,
  }
  for (const listener of listeners) listener()
}
const capture = () => {
  const document = editorDocument.get()
  return document
    ? Object.freeze({
        ...document,
        tabs: document.tabs.map((tab) => Object.freeze({ ...tab })),
      })
    : null
}
function open(
  definition: RegisteredView,
  options: Parameters<ViewRegistration['open']>[0] = {},
  reveal = true,
): ViewInstance {
  if (definitions.get(definition.id) !== definition)
    throw new Error('This view is no longer available.')
  const localId = options.id ?? 'default'
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(localId))
    throw new Error('Invalid view instance ID.')
  const id = `${definition.id}:${localId}`
  const existing = instances.get(id)
  if (existing) {
    if ('input' in options)
      instances.set(id, { ...existing, input: options.input })
    if (reveal) existing.handle.show()
    else {
      activeSidebar = id
      publish()
    }
    if (options.focus !== false) existing.handle.focus()
    return existing.handle
  }
  if (
    [...instances.values()].filter(
      (entry) => entry.definition.owner === definition.owner,
    ).length >= 8 ||
    instances.size >= 32
  )
    throw new Error('Close a plugin view before opening another.')
  const panel = definition.location === 'panel'
  const returnFocus =
    window.document.activeElement instanceof HTMLElement
      ? window.document.activeElement
      : null
  const handle: ViewInstance = {
    id,
    show() {
      if (!instances.has(id)) return
      if (panel) activePanel = id
      else activeSidebar = id
      publish()
      if (!panel) definition.environment.openSidebar(definition.id)
    },
    hide() {
      if (!instances.has(id)) return
      const element = window.document.querySelector(
        `[data-addon-view="${CSS.escape(id)}"]`,
      )
      if (element?.contains(window.document.activeElement)) {
        const target =
          returnFocus?.isConnected && !returnFocus.closest('[hidden], [inert]')
            ? returnFocus
            : window.document.querySelector<HTMLElement>(
                '.editor-panes .rich-pane:not([inert]) [contenteditable="true"], .editor-panes .source-pane:not([inert]) [contenteditable="true"]',
              )
        target?.focus({ preventScroll: true })
      }
      if (panel && activePanel === id) activePanel = null
      else if (!panel && activeSidebar === id) {
        activeSidebar = null
        definition.environment.closeSidebar()
      }
      if (focusTarget === id) focusTarget = null
      publish()
    },
    close() {
      if (!instances.has(id)) return
      handle.hide()
      instances.delete(id)
      publish()
    },
    focus() {
      if (!instances.has(id)) return
      focusTarget = id
      publish()
    },
  }
  instances.set(id, {
    id,
    definition,
    input: options.input,
    binding: options.binding ?? 'follow',
    document: options.binding === 'pinned' ? capture() : null,
    handle,
  })
  if (reveal) handle.show()
  else {
    activeSidebar = id
    publish()
  }
  if (options.focus !== false) handle.focus()
  return handle
}
export const addonViews = {
  snapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  register(
    owner: string,
    view: AddonView,
    environment: Environment,
  ): ViewRegistration {
    const id = `${owner}.${view.id}`
    if (
      !/^[a-z][a-z0-9-]*$/.test(view.id) ||
      definitions.has(id) ||
      (view.location && !['sidebar', 'panel'].includes(view.location)) ||
      (view.lifetime && !['visible', 'session'].includes(view.lifetime))
    )
      throw new Error(
        `This plugin supplied a duplicate or invalid view: ${id}.`,
      )
    const definition = { ...view, id, owner, environment }
    definitions.set(id, definition)
    publish()
    return {
      open: (options) => open(definition, options),
      dispose() {
        if (definitions.get(id) !== definition) return
        for (const entry of [...instances.values()])
          if (entry.definition === definition) entry.handle.close()
        definitions.delete(id)
        publish()
      },
    }
  },
  selectSidebar(id: string, input?: unknown) {
    const definition = definitions.get(id)
    if (!definition || definition.location === 'panel') return
    const current = activeSidebar && instances.get(activeSidebar)
    if (current && current.definition === definition) return
    open(definition, { input, focus: false }, false)
  },
  focusHandled(id: string) {
    if (focusTarget === id) {
      focusTarget = null
      publish()
    }
  },
}
