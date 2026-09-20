import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

test('typing speed counts every input while publishing only on the existing one-second timer', async (t) => {
  const output = await build({
    entryPoints: [
      fileURLToPath(
        new URL('../src/addons/typing-speed/index.ts', import.meta.url),
      ),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  const { default: addon } = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`
  )
  t.mock.timers.enable({ apis: ['setInterval'] })
  let time = 0,
    input
  t.mock.method(performance, 'now', () => time)
  const labels = new Map(),
    updates = []
  addon.start({
    statusBar: {
      register(item) {
        labels.set(item.id, item.label)
        return {
          update(change) {
            labels.set(item.id, change.label)
            updates.push(change)
          },
        }
      },
    },
    editor: {
      onInput(listener) {
        input = listener
      },
    },
  })
  t.after(() => addon.stop())
  for (let key = 0; key < 1000; key++) {
    time = key
    input({ characters: 1 })
  }
  assert.deepEqual(updates, [])
  time = 1000
  t.mock.timers.tick(1000)
  assert.equal(updates.length, 2)
  assert.equal(labels.get('cpm'), '≈60000 cpm')
  assert.equal(labels.get('wpm'), '≈12000 wpm')
  for (time = 2000; time <= 5000; time += 1000) t.mock.timers.tick(1000)
  assert.equal(labels.get('cpm'), '≈60000 cpm')
  time = 6000
  t.mock.timers.tick(1000)
  assert.equal(labels.get('cpm'), '≈0 cpm')
  assert.equal(labels.get('wpm'), '≈0 wpm')
  const count = updates.length
  addon.stop()
  time = 7000
  t.mock.timers.tick(1000)
  assert.equal(updates.length, count)
})
