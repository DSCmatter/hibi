import { Marked } from 'marked'

/** Use Marked's fence parser so indentation, long fences, and raw source round-trip. */
export function fencedBlock(language: string, type: string) {
  const lexer = new Marked()
  return (source: string) => {
    if (!/^ {0,3}(?:`{3,}|~{3,})/.test(source)) return
    const token = lexer.lexer(source)[0]
    if (token?.type !== 'code' || token.lang?.toLowerCase() !== language) return
    return { type, raw: token.raw, source: token.text }
  }
}
export function fenceSource(language: string, source: string) {
  const ticks = '`'.repeat(
    Math.max(
      3,
      ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1),
    ),
  )
  return `${ticks}${language}\n${source}\n${ticks}`
}
