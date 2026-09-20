import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerSourceView,
  resolveSourceReference,
} from '../src/renderer/src/source-view.ts'

const syntax = {
  gfm: true,
  alerts: true,
  textExtras: true,
  math: false,
  frontmatter: true,
}

test('source reference requests use only their mounted view resolver', async () => {
  const first = { dom: {} },
    second = { dom: {} },
    calls = [],
    controller = new AbortController()
  const detachFirst = registerSourceView(
    first,
    () => {},
    undefined,
    async (options, label, signal) => {
      calls.push({ options, label, signal })
      return { status: 'resolved', value: { href: '/first' } }
    },
  )
  const detachSecond = registerSourceView(
    second,
    () => {},
    undefined,
    async () => ({ status: 'resolved', value: null }),
  )
  try {
    assert.deepEqual(
      await resolveSourceReference(
        first,
        syntax,
        'normalized label',
        controller.signal,
      ),
      { status: 'resolved', value: { href: '/first' } },
    )
    assert.deepEqual(await resolveSourceReference(second, syntax, 'missing'), {
      status: 'resolved',
      value: null,
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options, syntax)
    assert.equal(calls[0].label, 'normalized label')
    assert.equal(calls[0].signal, controller.signal)
    detachFirst()
    assert.deepEqual(
      await resolveSourceReference(first, syntax, 'after detach'),
      {
        status: 'unavailable',
      },
    )
    assert.equal(calls.length, 1)
  } finally {
    detachFirst()
    detachSecond()
  }
})

test('unavailable and stale reference reads remain distinct from missing definitions', async () => {
  const unsupported = { dom: {} },
    stale = { dom: {} },
    unmounted = { dom: {} }
  const detachUnsupported = registerSourceView(unsupported, () => {})
  const detachStale = registerSourceView(
    stale,
    () => {},
    undefined,
    async () => ({ status: 'stale' }),
  )
  try {
    for (const view of [unsupported, unmounted])
      assert.deepEqual(await resolveSourceReference(view, syntax, 'label'), {
        status: 'unavailable',
      })
    assert.deepEqual(await resolveSourceReference(stale, syntax, 'label'), {
      status: 'stale',
    })
  } finally {
    detachUnsupported()
    detachStale()
  }
})
