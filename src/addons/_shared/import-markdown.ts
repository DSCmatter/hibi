import { posix } from 'node:path'
import { Marked } from 'marked'
import type { ImportFile } from '../../shared/imports'

const decoder = new TextDecoder('utf-8', { fatal: true })
export const importText = (file: ImportFile) => {
  if (file.data.byteLength > 2 * 1024 * 1024)
    throw new Error(
      `This document exceeds the 2 MiB editing limit: ${file.path}`,
    )
  return decoder.decode(file.data)
}
export const textFile = (path: string, text: string): ImportFile => ({
  path,
  data: new TextEncoder().encode(text),
})
const markdown = new Marked()

/** Keep code fences and inline code literal when translating note links. */
export function outsideCode(
  source: string,
  transform: (source: string) => string,
) {
  const normalized = source.replace(/\r\n?/g, '\n')
  const inline = (text: string) => {
    let cursor = 0,
      result = ''
    for (const match of text.matchAll(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)) {
      result += transform(text.slice(cursor, match.index)) + match[0]
      cursor = match.index + match[0].length
    }
    return result + transform(text.slice(cursor))
  }
  let cursor = 0,
    result = ''
  for (const token of markdown.lexer(normalized)) {
    const offset = normalized.indexOf(token.raw, cursor)
    if (offset < 0) continue
    // Link definitions are kept in lexer metadata rather than its token list.
    result +=
      inline(normalized.slice(cursor, offset)) +
      (token.type === 'code' ? token.raw : inline(token.raw))
    cursor = offset + token.raw.length
  }
  return result + inline(normalized.slice(cursor))
}
export function wikiLinks(
  source: string,
  path: string,
  paths: readonly string[],
) {
  let embeddedNotes = false,
    unresolved = false
  const converted = outsideCode(source, (text) =>
    text.replace(
      /(!?)\[\[([^\]\n]+)\]\]/g,
      (raw, embed: string, body: string) => {
        const [target = '', alias] = body.split('|')
        const [file = '', heading] = target.split('#')
        const candidates = paths.filter(
          (candidate) =>
            candidate === file ||
            candidate === `${file}.md` ||
            candidate === posix.join(posix.dirname(path), file) ||
            candidate === posix.join(posix.dirname(path), `${file}.md`),
        )
        const matches = candidates.length
          ? candidates
          : paths.filter(
              (candidate) =>
                posix.basename(candidate) === file ||
                posix.basename(candidate, '.md') === file ||
                (/\.textbundle\/text\.md$/i.test(candidate) &&
                  posix.basename(posix.dirname(candidate), '.textbundle') ===
                    file),
            )
        if (file && matches.length !== 1) {
          unresolved = true
          return raw
        }
        const resolved = matches[0] ?? path
        if (embed && /\.(md|markdown)$/i.test(resolved)) embeddedNotes = true
        const url =
          posix
            .relative(posix.dirname(path), resolved)
            .split('/')
            .map(encodeURIComponent)
            .join('/') + (heading ? `#${encodeURIComponent(heading)}` : '')
        const label = (
          alias ??
          (heading || posix.basename(file, '.md'))
        ).replace(/[[\]\\]/g, '\\$&')
        return `${embed && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(resolved) ? '!' : ''}[${label}](${url})`
      },
    ),
  )
  return { source: converted, embeddedNotes, unresolved }
}
