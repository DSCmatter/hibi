import { marked } from 'marked'
import { readFrontmatter } from '../../shared/frontmatter.ts'

// Preserve source constructs the rich editor cannot round-trip without loss.
export function needsSourceEditing(source: string): boolean {
  if (readFrontmatter(source) || /^\s{0,3}\[[^\]]+\]:/m.test(source))
    return true
  let unsupported = false
  marked.walkTokens(marked.lexer(source), (token) => {
    if (
      token.type === 'def' ||
      (token.type === 'html' && !/^<br\s*\/?>$/i.test(token.raw.trim()))
    )
      unsupported = true
  })
  return unsupported
}
