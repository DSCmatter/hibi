import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { errorMessage } from '../../shared/errors'
import { Button, DocumentNotice, SettingRow, Toggle } from '../ui'
import type { VimConfig } from './config'

import { vimPreferences } from './preferences'

export function Settings() {
  const [preferences, setPreferences] = useState(vimPreferences)
  const [config, setConfig] = useState<VimConfig | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload explicitly refreshes the file without changing the toggle.
  useEffect(() => {
    if (!preferences.config) return
    let active = true
    setBusy(true)
    void window.hibi
      .queryAddon('vim', 'config')
      .then(
        (value) => {
          if (active) {
            setConfig(value as VimConfig)
            setError('')
          }
        },
        (error: unknown) => {
          if (active) {
            setConfig(null)
            setError(errorMessage(error))
          }
        },
      )
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [preferences.config, revision])
  return (
    <>
      <div className="settings-group">
        {(
          [
            [
              'insert',
              'Start in insert mode',
              'Start typing immediately when you open the source editor.',
            ],
            [
              'status',
              'Show Vim status',
              'Show the current mode and command in the status bar.',
            ],
          ] as const
        ).map(([key, label, description]) => (
          <SettingRow
            key={key}
            id={`vim-${key}`}
            label={label}
            description={description}
          >
            <Toggle
              id={`vim-${key}`}
              checked={preferences[key]}
              onChange={(event) => {
                setPreferences({
                  ...preferences,
                  [key]: event.target.checked,
                })
                localStorage.setItem(`vim:${key}`, String(event.target.checked))
                window.dispatchEvent(new Event('hibi:vim-settings'))
              }}
            />
          </SettingRow>
        ))}
      </div>
      <DocumentNotice
        variant="warning"
        title="Experimental"
        message="Only key mappings are imported. Lua functions, Vimscript, and external plugins are not run."
      />
      <div className="settings-group">
        <SettingRow
          id="vim-config"
          label="Use Vim/Neovim config"
          description="Import key mappings from your local config."
        >
          <Toggle
            id="vim-config"
            checked={preferences.config}
            onChange={(event) => {
              const config = event.target.checked
              setPreferences({ ...preferences, config })
              localStorage.setItem('vim:config', String(config))
              window.dispatchEvent(new Event('hibi:vim-settings'))
            }}
          />
        </SettingRow>
        {preferences.config && (
          <SettingRow
            id="vim-config-file"
            label="Config file"
            description={
              config?.path ??
              (busy ? 'Looking for a config…' : 'No config found.')
            }
          >
            <Button
              id="vim-config-file"
              aria-label="Choose config"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const result = (await window.hibi.invokeAddon(
                    'vim',
                    'chooseConfig',
                  )) as VimConfig | null
                  if (result) {
                    setConfig(result)
                    setError('')
                    window.dispatchEvent(new Event('hibi:vim-config'))
                  }
                } catch (error) {
                  setError(errorMessage(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Choose config…
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setRevision((value) => value + 1)
                window.dispatchEvent(new Event('hibi:vim-config'))
              }}
            >
              Reload
            </Button>
          </SettingRow>
        )}
      </div>
      {preferences.config && error && (
        <DocumentNotice title="Could not read Vim config" message={error} />
      )}
      {preferences.config && config?.path && !error && (
        <>
          <p role="status">
            {config.mappings.length}{' '}
            {config.mappings.length === 1 ? 'mapping' : 'mappings'} ·{' '}
            {config.skipped.length} skipped
          </p>
          {config.skipped.length > 0 && (
            <details className="ui-disclosure">
              <summary>
                <ChevronRight size={14} aria-hidden />
                Skipped mappings
              </summary>
              <ul>
                {config.skipped.map((entry) => (
                  <li key={`${entry.line}-${entry.reason}`}>
                    Line {entry.line}: {entry.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  )
}
