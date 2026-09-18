import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  launchBenchmarkApp,
  waitForEditor,
} from '../scripts/benchmark-flows.mjs'

test('content versions advance on edits and undo while tab switching preserves their versions', {
  timeout: 30000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-content-version-'))
  const app = await launchBenchmarkApp(profile)
  t.after(async () => {
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  await waitForEditor(page)
  const result = await page.evaluate(async () => {
    const editor = document.querySelector('.tiptap').editor
    const initial = await window.hibi.getDocument()
    editor.commands.insertContent('hello')
    const changed = await window.hibi.getDocument()
    editor.commands.setTextSelection(2)
    await window.hibi.updateDocument(changed.markdown)
    const same = await window.hibi.getDocument()
    editor.commands.undo()
    const undone = await window.hibi.getDocument()
    editor.commands.redo()
    const redone = await window.hibi.getDocument()
    await window.hibi.newDocument()
    const restored = await window.hibi.selectDocumentTab(initial.tabId)
    return { initial, changed, same, undone, redone, restored }
  })
  assert.equal(result.changed.revision, result.initial.revision)
  assert.ok(result.changed.contentVersion > result.initial.contentVersion)
  assert.equal(result.same.contentVersion, result.changed.contentVersion)
  assert.ok(result.undone.contentVersion > result.changed.contentVersion)
  assert.ok(result.redone.contentVersion > result.undone.contentVersion)
  assert.equal(result.restored.contentVersion, result.redone.contentVersion)
  assert.equal(result.restored.markdown, 'hello')
  assert.notEqual(result.restored.revision, result.redone.revision)
})
