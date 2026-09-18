import { createHash } from 'node:crypto'

// Fixtures are generated outside measured editor interactions. The final line
// has no terminator, so logical lines always equal newline sequences + 1.
export const engineFixtureFamilies = [
  'text',
  'markdown',
  'bbcode',
  'typst',
  'latex',
  'equations',
  'embedded-mermaid',
  'flowchart',
  'table',
  'list',
  'paragraph',
  'code',
  'unicode',
  'mixed-eol',
  'malformed',
]

export function documentEngineFixture(family, count) {
  if (!engineFixtureFamilies.includes(family))
    throw new Error(`Unknown fixture family: ${family}`)
  if (!Number.isSafeInteger(count) || count < 20 || count > 100_000)
    throw new Error('Fixture line count must be between 20 and 100,000.')
  const lines = [],
    resources = {}
  let suffix = [],
    extension = 'md',
    format = 'markdown'
  let regions = 0,
    nodes = 0,
    edges = 0,
    formulas = 0,
    diagrams = 0
  const prose = (n) =>
    `Paragraph ${n}: ordinary document content with enough text to exercise wrapping and local edits.`
  const recipes = {
    text: (n) => [prose(n)],
    markdown: (n) => [
      `## Section ${n}`,
      '',
      prose(n),
      '',
      'A **bold** phrase, _emphasis_, and a [local link](#section).',
      '',
      '- First item',
      '- Second item',
      '',
    ],
    bbcode: (n) => [
      prose(n),
      '',
      '[b]Bold[/b] and [i]italic[/i] with [url=https://example.com]a link[/url].',
      '',
      '[list]',
      '[*]First item',
      '[*]Second item',
      '[/list]',
      '',
    ],
    typst: (n) => [
      `= Section ${n}`,
      '',
      prose(n),
      '',
      '*Strong* and _emphasized_ prose.',
      '',
      '- First item',
      '- Second item',
      '',
    ],
    latex: (n) => [
      `\\section{Section ${n}}`,
      prose(n),
      '',
      '\\textbf{Bold} and \\emph{emphasized} prose.',
      '',
      '\\begin{itemize}',
      '\\item First item',
      '\\item Second item',
      '\\end{itemize}',
      '',
    ],
    equations: (n) => {
      formulas += 2
      return [
        `Formula ${n}: $\\frac{x^2}{y+1}$ in prose.`,
        '',
        '$$',
        '\\frac{a+b}{c+d} = x^2',
        '$$',
        '',
      ]
    },
    'embedded-mermaid': (n) => {
      diagrams++
      nodes += 2
      edges++
      return [
        `Diagram ${n}.`,
        '',
        '```mermaid',
        'flowchart LR',
        'A[Start] --> B[Finish]',
        '```',
        '',
      ]
    },
    flowchart: (n) => {
      nodes++
      edges++
      return [`N${n}[Node ${n}] --> N${n + 1}[Node ${n + 1}]`]
    },
    table: (n) => [`| Row ${n} | Value ${n} |`],
    list: (n) => [`- Item ${n} with **bold** text and a [link](#top).`],
    paragraph: (n) => [prose(n)],
    code: (n) => [`const value${n} = ${n}; // code inside one large fence`],
    unicode: (n) => [
      `Line ${n}: e\u0301 👩🏽‍💻 中文 日本語 한국어 العربية עברית.`,
      '',
    ],
    'mixed-eol': (n) => [prose(n), 'Unicode: é 中 😀 e\u0301.', ''],
    malformed: (n) => [
      `Paragraph ${n} with **unclosed emphasis and [unfinished link(`,
      '',
      '~~~unknown',
      '<unclosed data-value="x">',
      '',
    ],
  }
  if (family === 'text') extension = format = 'txt'
  if (family === 'bbcode') extension = format = 'bbcode'
  if (family === 'typst') {
    extension = 'typ'
    format = 'typst'
    lines.push(
      '#set page(width: 210mm, height: 297mm)',
      '#include "chapter.typ"',
      '',
    )
    resources['chapter.typ'] =
      '= Included chapter\n\nA resource-backed paragraph.\n'
  }
  if (family === 'latex') {
    extension = 'tex'
    format = 'latex'
    lines.push(
      '\\documentclass{article}',
      '\\begin{document}',
      '\\input{chapter}',
      '',
    )
    suffix = ['\\end{document}']
    resources['chapter.tex'] =
      '\\section{Included chapter}\nA resource-backed paragraph.\n'
  }
  if (family === 'flowchart') {
    extension = 'mmd'
    format = 'mermaid'
    nodes = 1
    diagrams = 1
    lines.push('flowchart LR')
  }
  if (family === 'table') lines.push('| Key | Value |', '| --- | --- |')
  if (family === 'code') {
    lines.push('```js')
    suffix = ['```']
  }
  const capacity = count - suffix.length
  while (lines.length < capacity) {
    const before = { nodes, edges, formulas, diagrams }
    const block = recipes[family](regions + 1)
    if (lines.length + block.length > capacity) {
      ;({ nodes, edges, formulas, diagrams } = before)
      lines.push(prose(regions + 1))
    } else lines.push(...block)
    regions++
  }
  lines.push(...suffix)
  if (lines.at(-1) === '') lines[lines.length - 1] = prose(regions + 1)
  let source = lines
    .map(
      (line, index) =>
        line +
        (index === lines.length - 1
          ? ''
          : family === 'mixed-eol'
            ? ['\r\n', '\n', '\r'][index % 3]
            : '\n'),
    )
    .join('')
  if (family === 'mixed-eol') source = `\uFEFF${source}`
  return {
    family,
    format,
    name: `${family}-${count}.${extension}`,
    source,
    resources,
    metadata: {
      seed: 'deterministic-v1',
      lines: count,
      utf16Length: source.length,
      utf8Bytes: Buffer.byteLength(source),
      longestLine: lines.reduce(
        (longest, line) => Math.max(longest, line.length),
        0,
      ),
      regions: ['table', 'list', 'paragraph', 'code', 'flowchart'].includes(
        family,
      )
        ? 1
        : regions,
      nodes,
      edges,
      formulas,
      diagrams,
      resourceCount: Object.keys(resources).length,
      sha256: createHash('sha256').update(source).digest('hex'),
      finalNewline: false,
    },
  }
}
