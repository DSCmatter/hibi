import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  launchBenchmarkApp,
  waitForEditor,
} from '../scripts/benchmark-flows.mjs'

test('typing coalesces formatting checks without delaying document changes or undo', {
  timeout: 30000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-input-'))
  const app = await launchBenchmarkApp(profile)
  t.after(async () => {
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  await waitForEditor(page)
  const result = await page.evaluate(async () => {
    const editor = document.querySelector('.tiptap').editor
    await new Promise(requestAnimationFrame)
    let checks = 0
    const can = editor.can.bind(editor)
    editor.can = (...args) => {
      checks++
      return can(...args)
    }
    for (const letter of 'hello') editor.commands.insertContent(letter)
    const immediate = { checks, text: editor.getText() }
    await new Promise(requestAnimationFrame)
    const afterFrame = checks
    const persisted = (await window.hibi.getDocument()).markdown
    editor.commands.undo()
    const undone = editor.getText()
    editor.commands.redo()
    return {
      immediate,
      afterFrame,
      persisted,
      undone,
      redone: editor.getText(),
    }
  })
  assert.deepEqual(result.immediate, { checks: 0, text: 'hello' })
  assert.equal(result.afterFrame, 35)
  assert.equal(result.persisted, 'hello')
  assert.equal(result.undone, '')
  assert.equal(result.redone, 'hello')
})
