import { performanceDiagnostics } from '../../ui/diagnostics'
import { defineAddon } from '../api'
import manifest from './manifest'

let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  async start(context) {
    stop = performanceDiagnostics.start()
    await context.native.query('start')
  },
  stop() {
    stop?.()
    stop = undefined
  },
})
