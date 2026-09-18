import { defineAddon } from '../api'
import manifest from './manifest'
import { typingSpeed } from './speed'

let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  start(context) {
    const speed = typingSpeed()
    const words = context.statusBar.register({
      id: 'wpm',
      label: '≈0 WPM',
      tooltip:
        'Estimated words per minute, using five characters per word. Resets after a 5-second pause.',
    })
    const characters = context.statusBar.register({
      id: 'cpm',
      label: '≈0 CPM',
      tooltip:
        'Characters typed per minute, excluding pasted text. Resets after a 5-second pause.',
    })
    const refresh = () => {
      const value = speed.read(performance.now())
      words.update({ label: `≈${value.wpm} wpm` })
      characters.update({ label: `≈${value.cpm} cpm` })
    }
    context.editor.onInput((event) => {
      speed.add(event.characters, performance.now())
      refresh()
    })
    const timer = setInterval(refresh, 1000)
    stop = () => clearInterval(timer)
  },
  stop() {
    stop?.()
    stop = undefined
  },
})
