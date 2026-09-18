import { lazy } from 'react'
import { defineAddon } from '../api'
import manifest from './manifest'
import { getPreferences, settingsEvent } from './preferences'

let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  Settings: lazy(() =>
    import('./Settings').then(({ Settings }) => ({ default: Settings })),
  ),
  start() {
    let disposed = false
    const sync = () => {
      if (!disposed)
        // Presence never edits files; avoid the editor lock used by native document actions.
        void window.hibi
          .invokeAddon(manifest.id, 'sync', getPreferences())
          .catch(() => {})
    }
    const disconnect = () => {
      void window.hibi.invokeAddon(manifest.id, 'disconnect').catch(() => {})
    }
    sync()
    const timer = window.setInterval(sync, 15_000)
    window.addEventListener(settingsEvent, sync)
    window.addEventListener('pagehide', disconnect)
    stop = () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener(settingsEvent, sync)
      window.removeEventListener('pagehide', disconnect)
      disconnect()
    }
  },
  stop() {
    stop?.()
    stop = undefined
  },
})
