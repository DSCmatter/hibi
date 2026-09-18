import { lazy } from 'react'
import { defineAddon } from '../api'
import manifest from './manifest'
import { vimPreferences } from './preferences'
import css from './vim.css?inline'

let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  Settings: lazy(() =>
    import('./Settings').then(({ Settings }) => ({ default: Settings })),
  ),
  start(context) {
    let disposed = false
    let keymaps: typeof import('./keymaps') | undefined
    let pending: Promise<void> = Promise.resolve()
    let useConfig: boolean | undefined
    const loadConfig = () => {
      useConfig = vimPreferences().config
      if (!useConfig && !keymaps) return pending
      pending = import('./keymaps').then(async (module) => {
        if (disposed) return
        keymaps = module
        await keymaps.loadConfigMappings(context)
      })
      return pending
    }
    context.styles.register('editor', css)
    context.editor.registerSource({
      id: 'keymap',
      create: async () => {
        const engine = await import('./engine')
        await pending
        return engine.createVim(context)
      },
    })
    const status = context.statusBar.register({
      id: 'unavailable',
      label: '',
      tooltip: 'Switch to source or side-by-side view to use Vim.',
      when: 'normal',
    })
    const applyPreferences = () => {
      status.update({ label: vimPreferences().status ? 'Vim · off' : '' })
      if (useConfig !== vimPreferences().config) void loadConfig()
    }
    applyPreferences()
    window.addEventListener('hibi:vim-settings', applyPreferences)
    window.addEventListener('hibi:vim-config', loadConfig)
    stop = () => {
      disposed = true
      keymaps?.clearConfigMappings()
      window.removeEventListener('hibi:vim-settings', applyPreferences)
      window.removeEventListener('hibi:vim-config', loadConfig)
    }
  },
  stop() {
    stop?.()
    stop = undefined
  },
})
