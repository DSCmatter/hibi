import { useState } from 'react'
import { SettingRow, Toggle } from '../ui'

import { vimPreferences } from './preferences'

export function Settings() {
  const [preferences, setPreferences] = useState(vimPreferences)
  return (
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
  )
}
