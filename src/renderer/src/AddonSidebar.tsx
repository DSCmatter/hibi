import { FolderOpen, ListTree, PanelLeft } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import type { AddonView } from '../../addons/api'
import { Sidebar, type SidebarProps } from '../../ui/Sidebar'
import { AddonViewContent } from './AddonViewContent'
import { addonViews } from './addon-views'

export const builtInViews = [
  { id: 'workspace', label: 'Workspace', icon: FolderOpen },
  { id: 'outline', label: 'On this page', icon: ListTree },
]

export function viewShortcut(view: AddonView) {
  return { id: view.id, label: view.label, icon: view.icon ?? PanelLeft }
}

export function AddonSidebar({
  view,
  input,
  open,
  overlay,
  onDismiss,
  resize,
}: {
  view: AddonView | undefined
  input: unknown
  open: boolean
  overlay: boolean
  onDismiss: () => void
  resize: NonNullable<SidebarProps['resize']>
}) {
  const state = useSyncExternalStore(addonViews.subscribe, addonViews.snapshot)
  useEffect(() => {
    if (open) addonViews.selectSidebar(view?.id ?? 'workspace', input)
  }, [open, view, input])
  return (
    <Sidebar
      className="document-sidebar addon-sidebar"
      label={view?.label ?? 'Addon view'}
      header={<span>{view?.label}</span>}
      items={[]}
      selected={null}
      onSelect={() => {}}
      open={open && !!view}
      overlay={overlay}
      onDismiss={onDismiss}
      resize={resize}
      content={state.instances
        .filter((entry) => entry.definition.location !== 'panel')
        .map((entry) => (
          <AddonViewContent
            key={entry.id}
            entry={entry}
            visible={
              open &&
              view?.id === entry.definition.id &&
              state.activeSidebar === entry.id
            }
          />
        ))}
    />
  )
}
