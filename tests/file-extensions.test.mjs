import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { pressShortcut } from './keyboard.mjs'

test('new files and save dialogs support document extensions beyond Markdown', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-new-formats-'))
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
  await page
    .getByRole('textbox', { name: 'Document editor', exact: true })
    .waitFor()
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] })
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.saveFilters = options.filters
      return { canceled: false, filePath: `${root}/saved.tex` }
    }
  }, root)
  await page.evaluate(() => window.hibi.saveDocument(false))
  const extensions = await app.evaluate(
    () => globalThis.saveFilters[0].extensions,
  )
  for (const ext of ['md', 'tex', 'typ', 'txt', 'html', 'org'])
    assert.ok(extensions.includes(ext), `${ext} is available in Save`)
  await pressShortcut(
    app,
    `${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+o`,
  )
  for (const ext of ['tex', 'typ', 'txt']) {
    await page
      .getByRole('button', { name: 'New workspace file', exact: true })
      .click()
    const name = page.getByRole('textbox', { name: 'Rename item', exact: true })
    await name.waitFor()
    assert.deepEqual(
      await name.evaluate((input) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
      [0, (await name.inputValue()).length],
    )
    await page.keyboard.type(`note.${ext}`)
    await name.press('Enter')
    await name.waitFor({ state: 'hidden' })
    const saved = await page.evaluate(() => window.hibi.saveDocument(false))
    assert.equal(saved.name, `note.${ext}`)
    assert.equal(await readFile(join(root, `note.${ext}`), 'utf8'), '')
  }
})
