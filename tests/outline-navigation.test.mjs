import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { clickMenu } from './keyboard.mjs'

test('large outline follows rich and source carets with bounded sidebar rows', {
  timeout: 45000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-outline-navigation-'))
  const file = join(profile, 'headings.md')
  await writeFile(
    file,
    '# top\r\n\r\n' +
      Array.from(
        { length: 1000 },
        (_, i) => `## node ${i}\r\n\r\ntext ${i}\r\n\r\n`,
      ).join(''),
  )
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  t.after(async () => {
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(7000)
  await page.setViewportSize({ width: 1100, height: 800 })
  const rich = page.getByRole('textbox', {
    name: 'Document editor',
    exact: true,
  })
  await rich.waitFor()
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, file)
  await clickMenu(app, 'Open…')
  await rich.getByRole('heading', { name: 'node 999', exact: true }).waitFor()
  await page.getByRole('button', { name: /^toggle right sidebar$/i }).click()
  await page.getByRole('button', { name: /^right sidebar views$/i }).click()
  await page
    .getByRole('menuitem', { name: 'On this page', exact: true })
    .click()
  const outline = page.locator(
    '.outline-sidebar[data-side="right"][data-open="true"]',
  )
  const selected = outline.locator(
    '[role="treeitem"][aria-selected="true"] .sidebar-label',
  )
  const expectSelected = async (label) => {
    await page.waitForFunction(
      (label) =>
        document.querySelector(
          '.outline-sidebar[data-side="right"] [role="treeitem"][aria-selected="true"] .sidebar-label',
        )?.textContent === label,
      label,
    )
    assert.equal(await selected.textContent(), label)
    assert.ok((await outline.locator('.sidebar-row').count()) < 65)
  }
  for (const label of ['node 999', 'node 100', 'node 500', 'top']) {
    await rich.evaluate((element, label) => {
      const editor = element.editor
      let position
      editor.state.doc.descendants((node, offset) => {
        if (node.type.name === 'heading' && node.textContent === label)
          position = offset + 1
      })
      editor.commands.setTextSelection(position)
    }, label)
    await expectSelected(label)
  }
  await page.getByRole('button', { name: /^source view$/i }).click()
  const source = page.getByRole('textbox', {
    name: 'Markdown editor',
    exact: true,
  })
  await source.waitFor()
  await source.focus()
  await source.press(
    process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End',
  )
  await expectSelected('node 999')
  await source.press(
    process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home',
  )
  await expectSelected('top')
})
