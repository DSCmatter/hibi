import {
  projectionRange,
  type TextProjection,
} from '../../shared/document-projection.ts'

export type Finding = {
  id: string
  from: number
  to: number
  replacement: string
  message: string
}
const corrections = {
  teh: 'the',
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  wierd: 'weird',
} as const
export function analyze(projection: TextProjection): Finding[] {
  const findings: Finding[] = []
  const add = (
    from: number,
    to: number,
    replacement: string,
    message: string,
  ) => {
    if (findings.length < 100 && projectionRange(projection, from, to))
      findings.push({ id: `${from}:${to}`, from, to, replacement, message })
  }
  for (const match of projection.text.matchAll(
    /\b(teh|recieve|seperate|definately|occured|untill|wierd)\b/gi,
  )) {
    const word = match[0],
      corrected = corrections[word.toLowerCase() as keyof typeof corrections]
    const replacement =
      word === word.toUpperCase()
        ? corrected.toUpperCase()
        : /^[A-Z]/.test(word)
          ? corrected.charAt(0).toUpperCase() + corrected.slice(1)
          : corrected
    add(
      match.index,
      match.index + word.length,
      replacement,
      `Change “${word}” to “${replacement}”`,
    )
    if (findings.length === 100) break
  }
  for (const match of projection.text.matchAll(/\b([a-z]{2,})[ \t]+\1\b/gi)) {
    const from = match.index + match[1]!.length
    add(
      from,
      match.index + match[0].length,
      '',
      `Remove repeated “${match[1]}”`,
    )
    if (findings.length === 100) break
  }
  return findings.sort((a, b) => a.from - b.from)
}
