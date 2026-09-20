import assert from 'node:assert/strict'
import test from 'node:test'
import { GFM, parser } from '@lezer/markdown'
import {
  outlineMathParser,
  SourceOutlineMathUnavailable,
  validateOutlineMathCandidate,
} from '../src/renderer/src/source-outline-math.ts'

const parse = (source, read = (from, to) => source.slice(from, to)) => {
  const tree = parser
    .configure([GFM, outlineMathParser(read, () => source.length)])
    .parse(source)
  const headings = [],
    math = []
  tree.iterate({
    enter(node) {
      if (/Heading/.test(node.name))
        headings.push(source.slice(node.from, node.to))
      if (node.name === 'HibiMathBlock') math.push([node.from, node.to])
    },
  })
  return { headings, math }
}

test('source outline math keeps confirmed top-level math opaque', () => {
  const source = '$$\n# inside math\n$$\n\n# real\n'
  assert.deepEqual(parse(source), {
    headings: ['# real'],
    math: [[0, source.indexOf('\n# real')]],
  })
  assert.deepEqual(parse('$$x$$\n\n# after\n').headings, ['# after'])
})

test('source outline math interrupts paragraphs only with a confirmed native token', () => {
  assert.deepEqual(parse('text\n$$\n# hidden\n$$\n\n# real').headings, [
    '# real',
  ])
  assert.deepEqual(parse('text\n$$\n---').headings, ['text\n$$\n---'])
})

test('source outline math preserves code blocks and rejects nested containers', () => {
  assert.deepEqual(parse('```\n$$\n# code\n$$\n```\n\n# real').headings, [
    '# real',
  ])
  for (const source of [
    '> $$\n> # hidden\n> $$\n\n# real',
    '- $$\n  # hidden\n  $$\n\n# real',
    '1. $$\n   # hidden\n   $$\n\n# real',
  ])
    assert.throws(() => parse(source), SourceOutlineMathUnavailable)
})

test('source outline math never accepts artificial EOF or scans beyond its limit', () => {
  const source = `$$x$$${' '.repeat(20_000)}\n# real`
  let maximumRead = 0
  assert.throws(
    () =>
      parse(source, (from, to) => {
        maximumRead = Math.max(maximumRead, to - from)
        return source.slice(from, to)
      }),
    SourceOutlineMathUnavailable,
  )
  assert.equal(maximumRead, 16_384)
  assert.throws(
    () => parse(`$$${'x'.repeat(20_000)}\n# real`),
    SourceOutlineMathUnavailable,
  )
  assert.deepEqual(
    parse(`$$x$$\n\n# real\n${'tail\n'.repeat(4000)}`).headings,
    ['# real'],
  )
})

test('source outline math paragraph validation refuses ambiguous source', () => {
  assert.doesNotThrow(() => validateOutlineMathCandidate('ordinary paragraph'))
  assert.throws(
    () => validateOutlineMathCandidate('before $$ math'),
    SourceOutlineMathUnavailable,
  )
  assert.throws(
    () => validateOutlineMathCandidate('uninspected tail', true),
    SourceOutlineMathUnavailable,
  )
})
