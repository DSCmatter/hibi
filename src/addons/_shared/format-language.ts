import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { type Language, StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { textile } from '@codemirror/legacy-modes/mode/textile'
import type { FormatSpec } from './format-specs'

export function formatLanguage(
  format: FormatSpec,
  resolve: (name: string) => Language | null,
) {
  if (format.reader === 'html') return html().language
  if (format.reader === 'latex') return StreamLanguage.define(stex)
  if (format.reader === 'textile') return StreamLanguage.define(textile)
  if (['mdx', 'mdsvex', 'markdoc', 'markdown', 'djot'].includes(format.reader))
    return markdown({ codeLanguages: resolve }).language
  const headings: Record<string, RegExp> = {
    rst: /^(?:[=~`^#*+-]{3,})\s*$/,
    asciidoc: /^={1,6}\s.+/,
    org: /^\*{1,6}\s.+/,
    mediawiki: /^={1,6}[^=].*/,
    creole: /^={1,6}[^=].*/,
  }
  return StreamLanguage.define({
    name: format.reader,
    token(stream) {
      if (stream.sol() && stream.match(headings[format.reader] ?? /$^/))
        return 'heading'
      if (stream.sol() && stream.match(/^(?:\.\.\s|\/\/|#\+).*/)) return 'meta'
      if (stream.sol() && stream.match(/^\s*(?:[-+*#]|\d+[.)])\s/))
        return 'list'
      if (stream.match(/^\[\[[^\]]+\]\]|^https?:\/\/[^\s]+/)) return 'link'
      if (stream.match(/^\*\*[^*]+\*\*|^'''[^']+'''/)) return 'strong'
      if (stream.match(/^\/\/[^/]+\/\/|^''[^']+''|^_[^_]+_/)) return 'emphasis'
      if (stream.match(/^``[^`]+``|^`[^`]+`|^\{\{\{.*?\}\}\}/))
        return 'monospace'
      if (stream.match(/^\[[^\]]+\]|^:[\w-]+:/)) return 'keyword'
      stream.next()
      return null
    },
  })
}
