import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { pressShortcut } from './keyboard.mjs'
import { waitForAsync } from './poll.mjs'

test('source reference links use current definitions and coexist with find', {
  timeout: 30000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-reference-links-'))
  const source =
    '---\r\nvalue: |\r\n  [target]: https://metadata.invalid/\r\n---\r\n\r\n[reference][TARGET]\r\n\r\n[target]: https://first.example/\r\n\r\n[target]: https://second.example/\r\n'
  const path = join(root, 'references.md')
  await writeFile(path, source)
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${join(root, 'profile')}`],
  })
  const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 25000)
  t.after(async () => {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 })
      })
      .catch(() => {})
    await app.close().catch(() => {})
    clearTimeout(watchdog)
    await rm(root, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(7000)
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page
    .getByRole('textbox', { name: 'Document editor', exact: true })
    .waitFor()
  await app.evaluate(({ dialog, shell }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    shell.openExternal = async (href) => {
      globalThis.openedReference = href
    }
  }, path)
  await pressShortcut(app, `${mod}+o`)
  await waitForAsync(
    page,
    async () => (await window.hibi.getDocument()).name === 'references.md',
  )
  await page.waitForFunction(
    () => document.querySelector('.app').getAttribute('aria-busy') === 'false',
  )
  await pressShortcut(app, `${mod}+Shift+\\`)
  const editor = page.getByRole('textbox', {
    name: 'Markdown editor',
    exact: true,
  })
  await editor.waitFor()
  const clickReference = async () => {
    const point = await editor.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode,
          at = node.textContent.indexOf('reference')
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(node, at + 1)
        range.setEnd(node, at + 2)
        const box = range.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
    })
    assert.ok(point)
    await page.keyboard.down('Shift')
    await page.mouse.click(point.x, point.y)
    await page.keyboard.up('Shift')
  }
  const opened = async (href) => {
    const until = Date.now() + 6000
    while ((await app.evaluate(() => globalThis.openedReference)) !== href) {
      assert.ok(Date.now() < until, `Reference did not open ${href}`)
      await new Promise((done) => setTimeout(done, 20))
    }
  }
  await clickReference()
  await opened('https://first.example/')
  await editor.click()
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.insertText(
    source.replace('https://first.example/', 'https://changed.example/'),
  )
  await waitForAsync(page, async () =>
    (await window.hibi.getDocument()).markdown.includes(
      'https://changed.example/',
    ),
  )
  await pressShortcut(app, `${mod}+f`)
  const search = page.getByRole('textbox', {
    name: 'Find in document',
    exact: true,
  })
  await search.fill('target')
  await page.keyboard.press('Escape')
  await clickReference()
  await opened('https://changed.example/')
})
