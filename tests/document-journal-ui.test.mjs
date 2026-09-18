import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'

test('journal barriers preserve immediate saves, retries, renderer recovery, and native close', {
  timeout: 45000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-journal-'))
  const file = join(profile, 'note.md')
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  t.after(async () => {
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(7000)
  const editor = () =>
    page.getByRole('textbox', { name: 'Document editor', exact: true })
  await editor().waitFor()
  await app.evaluate(({ dialog, ipcMain }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    dialog.showMessageBox = async () => ({ response: 0 })
    const append = ipcMain._invokeHandlers.get('document:append')
    ipcMain.removeHandler('document:append')
    ipcMain.handle('document:append', async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 80))
      const result = await append(...args)
      if (!globalThis.lostJournalAck) {
        globalThis.lostJournalAck = true
        throw new Error('Simulated lost acknowledgment')
      }
      return result
    })
  }, file)
  await editor().fill('first edit 😀')
  const saved = await page.evaluate(() => window.hibi.saveDocument(true))
  assert.equal(saved.markdown, 'first edit 😀')
  assert.equal(saved.contentVersion, 1)
  assert.equal(await readFile(file, 'utf8'), saved.markdown)
  await editor().fill('recover this unsaved change')
  await page.evaluate(() => window.hibi.flushDocumentChanges())
  await app.evaluate(
    ({ BrowserWindow }) =>
      new Promise((resolve) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents
        contents.once('did-finish-load', resolve)
        contents.forcefullyCrashRenderer()
      }),
  )
  // Playwright keeps crashed targets marked as crashed after Electron reloads them.
  // Inspect the replacement renderer through Electron's live webContents instead.
  const recovered = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`
    new Promise(resolve => {
      const ready = () => {
        const element = document.querySelector('.tiptap[contenteditable="true"]');
        if (!element) { setTimeout(ready, 20); return; }
        resolve({ text: element.textContent });
      }; ready();
    })
  `),
  )
  assert.equal(recovered.text, 'recover this unsaved change')
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(`
    document.querySelector('.tiptap').editor.commands.setContent('native close must keep this final edit', { contentType: 'markdown' })
  `),
  )
  const closed = new Promise((resolve) => page.once('close', resolve))
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  )
  await closed
  assert.equal(
    await readFile(file, 'utf8'),
    'native close must keep this final edit',
  )
})
