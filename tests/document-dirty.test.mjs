import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'

test('native dirty state tracks inactive drafts, reordered tabs, pending files and tab resets', {
  timeout: 30000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-dirty-tabs-'))
  const notes = join(root, 'notes')
  await mkdir(notes)
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${join(root, 'profile')}`],
  })
  t.after(async () => {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 })
    })
    await app.close()
    await rm(root, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(6000)
  await page
    .getByRole('textbox', { name: 'Document editor', exact: true })
    .waitFor()
  await app.evaluate(({ dialog }) => {
    globalThis.discardChoice = 1
    dialog.showMessageBox = async () => ({ response: globalThis.discardChoice })
  })
  const read = () => page.evaluate(() => window.hibi.getDocument())
  const edited = async (expected) => {
    assert.equal(
      (await read()).tabs.some((tab) => tab.dirty),
      expected,
    )
    if (process.platform === 'darwin')
      assert.equal(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isDocumentEdited(),
        ),
        expected,
      )
  }
  await edited(false)
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const setEdited = window.setDocumentEdited.bind(window)
    globalThis.dirtyCalls = []
    window.setDocumentEdited = (edited) => {
      globalThis.dirtyCalls.push(edited)
      return setEdited(edited)
    }
  })
  const first = (await read()).tabId
  await page.evaluate(() => window.hibi.updateDocument('first draft'))
  await edited(true)
  const second = (await page.evaluate(() => window.hibi.newDocument())).tabId
  assert.equal((await read()).dirty, false)
  await edited(true)
  await page.evaluate((id) => window.hibi.moveDocumentTab(id, null), first)
  await edited(true)
  await page.evaluate(() => window.hibi.updateDocument('second draft'))
  await page.evaluate(() => window.hibi.updateDocument(''))
  await edited(true)
  assert.deepEqual(await app.evaluate(() => globalThis.dirtyCalls), [true])
  await page.evaluate((id) => window.hibi.closeDocumentTab(id), first)
  await edited(false)

  await app.evaluate(({ dialog }, notes) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [notes],
    })
  }, notes)
  await page.evaluate(() => window.hibi.openWorkspace())
  const pending = await page.evaluate(() =>
    window.hibi.workspaceAction({ action: 'new-file', path: '' }),
  )
  assert.equal(pending.document.ephemeral, true)
  await edited(true)
  await page.evaluate(
    (id) => window.hibi.closeDocumentTab(id),
    pending.document.tabId,
  )
  await edited(false)

  await page.evaluate(() => window.hibi.newDocument())
  await page.evaluate(() => window.hibi.updateDocument('inactive draft'))
  await page.evaluate((id) => window.hibi.selectDocumentTab(id), second)
  await app.evaluate(() => {
    globalThis.discardChoice = 2
  })
  assert.equal(
    (await page.evaluate(() => window.hibi.setTabsEnabled(false))).tabsEnabled,
    true,
  )
  await edited(true)
  await app.evaluate(() => {
    globalThis.discardChoice = 1
  })
  assert.equal(
    (await page.evaluate(() => window.hibi.setTabsEnabled(false))).tabsEnabled,
    false,
  )
  await edited(false)
  await page.evaluate(() => window.hibi.updateDocument('discard on new'))
  await edited(true)
  const fresh = await page.evaluate(() => window.hibi.newDocument())
  assert.equal(fresh.tabs.length, 1)
  assert.equal(fresh.markdown, '')
  await edited(false)
  assert.deepEqual(await app.evaluate(() => globalThis.dirtyCalls), [
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
  ])
})
