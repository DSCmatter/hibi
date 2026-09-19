import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { arch, cpus, release, totalmem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!global.gc) throw Error('Run this benchmark with node --expose-gc.')
const modulePath = resolve(
  process.argv[2] ?? 'src/renderer/src/document-runtime.ts',
)
const { DocumentRuntime } = await import(pathToFileURL(modulePath).href)
const git = (...args) =>
  execFileSync('git', ['-C', dirname(modulePath), ...args], {
    encoding: 'utf8',
  }).trim()
const metadata = {
  commit: git('rev-parse', 'HEAD'),
  trackedDirty: !!git('status', '--porcelain', '--untracked-files=no'),
  scriptSha256: createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex'),
  node: process.version,
  v8: process.versions.v8,
  platform: process.platform,
  release: release(),
  arch: arch(),
  cpu: cpus()[0].model,
  logicalCpus: cpus().length,
  physicalMemory: totalmem(),
  scope:
    'Node DocumentRuntime operations; excludes editor DOM, IPC, rendering and native saves',
}
const samples = []
for (const lines of [1000, 10000, 100000]) {
  for (const grouping of ['typing', 'isolated']) {
    await setImmediate()
    global.gc()
    const memoryBefore = process.memoryUsage()
    let enqueued = 0
    const runtime = new DocumentRuntime({
      enqueue: () => {
        enqueued++
      },
      onError: (error) => {
        throw error
      },
    })
    const sessions = []
    const tabs = Array.from({ length: 9 }, (_, index) => ({
      id: `tab-${index}`,
      name: `note-${index}.txt`,
      dirty: true,
    }))
    const activate = (text, index) => {
      runtime.activate({
        tabId: tabs[index].id,
        tabs,
        tabsEnabled: true,
        id: `file-${index}`,
        name: tabs[index].name,
        revision: index,
        contentVersion: 0,
        markdown: text,
        savedMarkdown: text,
        dirty: false,
        ephemeral: false,
        canAutosave: true,
      })
      const session = runtime.session()
      sessions.push(session)
      return session
    }
    for (let tab = 0; tab < 8; tab++) {
      const session = activate('a'.repeat(20000), tab)
      for (let group = 0; group < 128; group++)
        session.edit(
          [
            {
              from: 0,
              to: 20000,
              insert: (group % 2 ? 'b' : 'c').repeat(20000),
            },
          ],
          'source',
          `seed-${group}`,
        )
    }
    const original = 'á 😀\r\n'.repeat(lines)
    const session = activate(original, 8)
    await Promise.all(sessions.map((entry) => entry.maintainStorage()))
    await setImmediate()
    global.gc()
    const cursor = original.length / 2
    const edit = (index) =>
      session.edit(
        [{ from: cursor + index, to: cursor + index, insert: 'x' }],
        'source',
        `input-${grouping === 'typing' ? Math.floor(index / 20) : index}`,
      )
    for (let index = 0; index < 200; index++) edit(index)
    session.counters(true)
    enqueued = 0
    const timings = []
    for (let index = 200; index < 1200; index++) {
      const started = performance.now()
      edit(index)
      timings.push(performance.now() - started)
    }
    const counters = session.counters()
    assert.equal(counters.materializations, 0)
    assert.equal(enqueued, 1000)
    assert.equal(
      session.snapshot().sliceRaw(cursor, cursor + 1200),
      'x'.repeat(1200),
    )
    assert.equal(session.snapshot().utf16Length, original.length + 1200)
    const history = sessions.reduce(
      (sum, entry) => {
        const size = entry.historySize()
        return {
          bytes: sum.bytes + size.bytes,
          groups: sum.groups + size.groups,
        }
      },
      { bytes: 0, groups: 0 },
    )
    const tracked = runtime.retainedHistory?.()
    if (tracked) {
      assert.equal(tracked.bytes, history.bytes)
      assert.equal(tracked.groups, history.groups)
      assert.ok(history.bytes <= 32 * 1024 * 1024 && history.groups <= 512)
    }
    await Promise.all(sessions.map((entry) => entry.maintainStorage()))
    await setImmediate()
    global.gc()
    const memoryRetained = process.memoryUsage()
    timings.sort((a, b) => a - b)
    const percentile = (value) => timings[Math.ceil(timings.length * value) - 1]
    samples.push({
      lines,
      originalBytes: Buffer.byteLength(original),
      grouping,
      inactiveTabs: 8,
      warmup: 200,
      measuredEdits: 1000,
      milliseconds: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
        max: timings.at(-1),
      },
      history,
      tracked: tracked ?? null,
      counters,
      heapDelta: memoryRetained.heapUsed - memoryBefore.heapUsed,
      arrayBufferDelta: memoryRetained.arrayBuffers - memoryBefore.arrayBuffers,
      rss: memoryRetained.rss,
    })
    runtime.dispose()
  }
}
console.log(JSON.stringify({ metadata, samples }, null, 2))
