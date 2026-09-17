import { lazy } from 'react'
import { defineAddon } from '../api'
import manifest from './manifest'

let generation = 0
let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  Settings: lazy(() =>
    import('./Settings').then(({ Settings }) => ({ default: Settings })),
  ),
  start(context) {
    const run = ++generation
    void import('./engine')
      .then((module) => {
        if (run === generation) stop = module.startKeybeats(context)
      })
      .catch(() => {
        if (run === generation) context.notify('could not load keybeats.')
      })
  },
  stop() {
    generation++
    stop?.()
    stop = undefined
  },
})
