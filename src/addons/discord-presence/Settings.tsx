import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../shared/errors'
import { Button, DocumentNotice, SettingRow, TextInput, Toggle } from '../ui'
import {
  getPreferences,
  setPreferences,
  validApplicationId,
} from './preferences'
import type { PresenceStatus } from './types'

export function Settings() {
  const root = useRef<HTMLDivElement>(null)
  const [preferences, setLocal] = useState(getPreferences)
  const [applicationId, setApplicationId] = useState(preferences.applicationId)
  const [status, setStatus] = useState<PresenceStatus | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!root.current?.checkVisibility()) return
      void window.hibi
        .queryAddon('discord-presence', 'status')
        .then((value) => {
          if (active) setStatus(value as PresenceStatus)
        })
        .catch((error) => {
          if (active) setError(errorMessage(error))
        })
    }
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  const saveId = () => {
    const value = applicationId.trim()
    if (value && !validApplicationId(value)) {
      setError('Enter a numeric Discord application ID, not a bot token.')
      return
    }
    setLocal(setPreferences({ applicationId: value }))
    setApplicationId(value)
    setError('')
  }
  return (
    <div ref={root}>
      <div className="settings-group">
        <SettingRow
          id="discord-application-id"
          label="Application ID"
          description="Uses Hibi's Discord application by default. Enter another application ID to use your own."
        >
          <TextInput
            id="discord-application-id"
            style={{ width: 'min(240px, 100%)', flexShrink: 0 }}
            inputMode="numeric"
            spellCheck={false}
            placeholder="Discord application ID"
            value={applicationId}
            aria-invalid={!!error}
            onChange={(event) => {
              setApplicationId(event.target.value)
              setError('')
            }}
            onBlur={saveId}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveId()
              }
            }}
          />
        </SettingRow>
        <SettingRow
          id="discord-setup"
          label="Discord application"
          description="Uses the locally installed Discord desktop app. No bot token or account password is needed."
        >
          <Button
            onClick={() =>
              void window.hibi
                .invokeAddon('discord-presence', 'setup')
                .catch((error) => setError(errorMessage(error)))
            }
          >
            Open developer portal
          </Button>
        </SettingRow>
      </div>
      {error && (
        <DocumentNotice
          variant="warning"
          title="Discord presence unavailable"
          message={error}
        />
      )}
      {status && (
        <DocumentNotice
          title={
            status.state === 'connected'
              ? 'Connected to Discord'
              : 'Discord connection'
          }
          message={status.message}
          busy={status.state === 'connecting'}
        />
      )}
      <h2>Activity</h2>
      <div className="settings-group">
        <SettingRow
          id="discord-document-name"
          label="Show document name"
          description="Share the active filename with people who can see your Discord activity. Document text and folder paths are never shared."
        >
          <Toggle
            id="discord-document-name"
            checked={preferences.showDocumentName}
            onChange={(event) =>
              setLocal(
                setPreferences({ showDocumentName: event.target.checked }),
              )
            }
          />
        </SettingRow>
        <SettingRow
          id="discord-elapsed"
          label="Show elapsed time"
          description="Show how long this presence session has been active."
        >
          <Toggle
            id="discord-elapsed"
            checked={preferences.showElapsed}
            onChange={(event) =>
              setLocal(setPreferences({ showElapsed: event.target.checked }))
            }
          />
        </SettingRow>
      </div>
    </div>
  )
}
