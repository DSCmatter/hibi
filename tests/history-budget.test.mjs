import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { pressShortcut } from './keyboard.mjs'
import { waitForAsync } from './poll.mjs'

test('combined history pressure preserves inactive drafts and active source undo, redo and save', {
  timeout: 45000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-history-budget-'))
  const addon = join(profile, 'installed-addons', 'history-fixture')
  const files = Array.from({ length: 5 }, (_, index) =>
    join(profile, `note-${index}.txt`),
  )
  await mkdir(addon, { recursive: true })
  await Promise.all(
    files.map((file, index) => writeFile(file, `note ${index}\r\n`)),
  )
  await writeFile(
    join(addon, 'hibi-addon.json'),
    JSON.stringify({
      id: 'history-fixture',
      name: 'History fixture',
      description: 'History retention fixture',
      kind: 'extension',
      apiVersion: 2,
      version: '1.0.0',
      authors: [{ displayName: 'Test' }],
      capabilities: ['source'],
      entry: 'index.js',
    }),
  )
  await writeFile(
    join(addon, '.hibi-install.json'),
    JSON.stringify({
      hash: 'a'.repeat(64),
      files: ['index.js', 'hibi-addon.json'],
      source: 'local',
    }),
  )
  await writeFile(
    join(profile, 'addons.json'),
    JSON.stringify({ 'history-fixture': true }),
  )
  await writeFile(
    join(addon, 'index.js'),
    `export default sdk => ({ start(context) {
    const fixture = window.historyFixture = { sdk, view: null };
    context.editor.registerSource({ id: 'observe', create: () => [sdk.codeMirror.view.ViewPlugin.define(view => {
      fixture.view = view;
      return { destroy() { if (fixture.view === view) fixture.view = null } };
    })] });
  }});`,
  )
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 42000)
  t.after(async () => {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 })
      })
      .catch(() => {})
    await app.close().catch(() => {})
    clearTimeout(watchdog)
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(6000)
  await page.waitForFunction(() => !!window.historyFixture)
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  const open = async (index) => {
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      })
    }, files[index])
    await pressShortcut(app, `${mod}+o`)
    await page.waitForFunction((prefix) => {
      const view = window.historyFixture.view
      return (
        view?.state.doc.toString().startsWith(prefix) &&
        view.contentDOM.isContentEditable
      )
    }, `note ${index}`)
  }
  for (let index = 0; index < files.length; index++) {
    await open(index)
    const depth = await page.evaluate(() => {
      const { sdk, view } = window.historyFixture
      for (let group = 0; group < 128; group++)
        view.dispatch({
          changes: { from: view.state.doc.length, insert: 'x' },
          annotations: [
            sdk.codeMirror.commands.isolateHistory.of('full'),
            sdk.codeMirror.state.Transaction.userEvent.of('input.type'),
          ],
        })
      return sdk.codeMirror.commands.undoDepth(view.state)
    })
    assert.equal(depth, 128)
    assert.equal(
      (await page.evaluate(() => window.hibi.getDocument())).markdown,
      `note ${index}\r\n${'x'.repeat(128)}`,
    )
  }
  await open(0)
  assert.equal(
    await page.evaluate(() => {
      const { sdk, view } = window.historyFixture
      return sdk.codeMirror.commands.undoDepth(view.state)
    }),
    0,
  )
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).dirty,
    true,
  )
  await pressShortcut(app, `${mod}+s`)
  await waitForAsync(page, async () => !(await window.hibi.getDocument()).dirty)
  assert.equal(await readFile(files[0], 'utf8'), `note 0\r\n${'x'.repeat(128)}`)
  await open(4)
  await pressShortcut(app, `${mod}+z`)
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).markdown,
    `note 4\r\n${'x'.repeat(127)}`,
  )
  await pressShortcut(app, `${mod}+Shift+z`)
  await pressShortcut(app, `${mod}+s`)
  await waitForAsync(page, async () => !(await window.hibi.getDocument()).dirty)
  assert.equal(await readFile(files[4], 'utf8'), `note 4\r\n${'x'.repeat(128)}`)
})
