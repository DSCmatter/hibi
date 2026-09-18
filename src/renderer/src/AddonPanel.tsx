import { Focus, X } from 'lucide-react'
import { useRef, useSyncExternalStore } from 'react'
import { IconButton } from '../../ui/Controls'
import { AddonViewContent } from './AddonViewContent'
import { addonViews } from './addon-views'
import { editorDocument } from './document-formats'
import './addon-panel.css'

export function AddonPanel({ hidden }: { hidden: boolean }) {
  const state = useSyncExternalStore(addonViews.subscribe, addonViews.snapshot)
  const entries = state.instances.filter(
    (entry) => entry.definition.location === 'panel',
  )
  const active = entries.find((entry) => entry.id === state.activePanel)
  const root = useRef<HTMLElement>(null)
  const close = () => {
    const hadFocus = root.current?.contains(document.activeElement)
    active?.handle.hide()
    if (hadFocus)
      document
        .querySelector<HTMLElement>(
          '.editor-panes .rich-pane:not([inert]) [contenteditable="true"], .editor-panes .source-pane:not([inert]) [contenteditable="true"]',
        )
        ?.focus({ preventScroll: true })
  }
  return (
    <section
      ref={root}
      className="addon-panel"
      hidden={hidden || !active}
      aria-label={active?.definition.label ?? 'Addon panel'}
    >
      <header className="addon-panel-header">
        <span>
          {active?.definition.label}
          {active?.binding === 'pinned' && <> · {active.document?.name}</>}
        </span>
        <IconButton
          aria-label="Focus document"
          onClick={() => {
            const target =
              active?.binding === 'pinned'
                ? active.document
                : editorDocument.get()
            if (active && target)
              void active.definition.environment.focusDocument(target.tabId)
          }}
        >
          <Focus size={16} />
        </IconButton>
        <IconButton aria-label="Hide panel" onClick={close}>
          <X size={16} />
        </IconButton>
      </header>
      {entries.map((entry) => (
        <AddonViewContent
          key={entry.id}
          entry={entry}
          visible={!hidden && entry.id === active?.id}
        />
      ))}
    </section>
  )
}
