import { useState } from 'react'
import type { Addon, AddonState } from '../../addons/api'
import { Button, SettingRow, Toggle } from '../../ui/Controls'
import { SettingsFilter } from '../../ui/SettingsFilter'
import { useToasts } from '../../ui/Sonner'

export function FormatsSettings({
  addons,
  states,
  setEnabled,
  open,
}: {
  addons: readonly Addon[]
  states: readonly AddonState[]
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  open: (category: string) => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const toasts = useToasts()
  const formats = addons.filter(
    ({ manifest }) => manifest.fileExtensions?.length,
  )
  const matching = formats.filter(({ manifest }) =>
    `${manifest.name} ${manifest.fileExtensions?.map((extension) => `.${extension}`).join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const plainText = 'plain text .txt'.includes(query.trim().toLowerCase())
  return (
    <>
      <h1>Formats</h1>
      <SettingsFilter
        id="formats-filter"
        label="Filter formats"
        placeholder="Filter formats…"
        value={query}
        onChange={setQuery}
      />
      <h2>Document formats</h2>
      <div className="settings-group">
        {plainText && (
          <SettingRow
            id="format-text"
            label="Plain text"
            description=".txt · Built in"
          >
            <span className="setting-availability">Always available</span>
          </SettingRow>
        )}
        {matching.map(({ manifest }) => (
          <SettingRow
            key={manifest.id}
            id={`format-${manifest.id}`}
            label={manifest.name}
            description={manifest.fileExtensions
              ?.map((extension) => `.${extension}`)
              .join(' · ')}
          >
            <Button
              onClick={() => open(`plugin-${manifest.id}`)}
              aria-label={`${manifest.name} settings`}
            >
              Settings
            </Button>
            {manifest.id === 'markdown' ? (
              <span className="setting-availability">Always available</span>
            ) : (
              <Toggle
                id={`format-${manifest.id}`}
                disabled={busy}
                checked={states.some(
                  (state) => state.id === manifest.id && state.enabled,
                )}
                onChange={async (event) => {
                  setBusy(true)
                  try {
                    await setEnabled(manifest.id, event.target.checked)
                  } catch (error) {
                    toasts.show({
                      message:
                        error instanceof Error ? error.message : String(error),
                      variant: 'error',
                    })
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            )}
          </SettingRow>
        ))}
      </div>
      {!matching.length && !plainText && <p>No matching formats.</p>}
    </>
  )
}
