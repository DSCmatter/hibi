import { StreamLanguage } from '@codemirror/language'
export const bbcodeLanguage = StreamLanguage.define({
  name: 'bbcode',
  startState: () => ({ code: false }),
  token(stream, state) {
    if (stream.match(/^\[\/code\]/i)) {
      state.code = false
      return 'tagName'
    }
    if (state.code) {
      stream.next()
      return 'monospace'
    }
    if (stream.match(/^\[code\]/i)) {
      state.code = true
      return 'tagName'
    }
    if (
      stream.match(
        /^\[\/?(?:b|i|u|s|url|img|quote|list|color|size|\*)(?:=[^\]\n]*)?\]/i,
      )
    )
      return 'tagName'
    stream.next()
    return null
  },
})
