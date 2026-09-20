import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { blockMarkdownMarkers } from '../src/renderer/src/markdown-markers.ts'
import { electron } from './electron.mjs'
import { clickMenu, pressShortcut } from './keyboard.mjs'
import { waitForAsync } from './poll.mjs'

const schema = getSchema([StarterKit])
const bold = schema.marks.bold.create()
const italic = schema.marks.italic.create()

test('block markers retain nested and adjacent mark boundaries without touching text', () => {
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text('one', [bold]),
    schema.text(' two', [bold, italic]),
    schema.text(' three', [bold]),
    schema.text(' code', [schema.marks.code.create()]),
  ])
  assert.deepEqual(blockMarkdownMarkers(paragraph, 10), [
    { pos: 10, text: '**', side: -1 },
    { pos: 13, text: '*', side: -1 },
    { pos: 17, text: '*', side: 1 },
    { pos: 23, text: '**`', side: 0 },
    { pos: 28, text: '`', side: 1 },
  ])
  assert.equal(paragraph.textContent, 'one two three code')
  const linked = schema.nodes.paragraph.create(null, [
    schema.text('a', [bold]),
    schema.text('b', [
      bold,
      schema.marks.link.create({ href: 'https://example.com' }),
    ]),
    schema.text('c', [bold]),
  ])
  assert.deepEqual(
    blockMarkdownMarkers(linked, 1).map((hint) => hint.text),
    ['**', '**'],
  )
})

test('heading hints reflect level and code blocks and unformatted paragraphs stay untouched', () => {
  const heading = schema.nodes.heading.create(
    { level: 3 },
    schema.text('title', [bold]),
  )
  assert.deepEqual(blockMarkdownMarkers(heading, 7), [
    { pos: 7, text: '### ', side: -10 },
    { pos: 7, text: '**', side: -1 },
    { pos: 12, text: '**', side: 1 },
  ])
  assert.deepEqual(
    blockMarkdownMarkers(
      schema.nodes.codeBlock.create(null, schema.text('**literal**')),
      1,
    ),
    [],
  )
  assert.deepEqual(
    blockMarkdownMarkers(
      schema.nodes.paragraph.create(null, schema.text('**literal**')),
      1,
    ),
    [],
  )
})

test('rich markers follow only the focused block, preserve copying and undo, and can be disabled', {
  timeout: 60000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-markers-'))
  const source =
    '# Marker heading\n\nSome **bold** and *italic* with `code` and ~~strike~~.\n\nAnother **block**.\n\n```js\nconst literal = "**plain**"\n```'
  const note = join(profile, 'markers.md')
  await writeFile(note, source)
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`, note],
  })
  t.after(async () => {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 })
    })
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(8000)
  await page.setViewportSize({ width: 1100, height: 850 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const rich = page.getByRole('textbox', { name: /document editor/i })
  const heading = rich.locator('h1')
  await heading.click()
  await heading.locator('.markdown-marker').waitFor()
  assert.equal(
    await heading.locator('.markdown-marker').getAttribute('data-marker'),
    '# ',
  )
  assert.equal(await rich.locator('p .markdown-marker').count(), 0)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/markdown-markers-heading.png' })
  const paragraph = rich.locator('p').first()
  await paragraph.click()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.tiptap p:first-of-type .markdown-marker')
        .length === 8,
  )
  assert.equal(await heading.locator('.markdown-marker').count(), 0)
  assert.equal(
    await paragraph.textContent(),
    'Some bold and italic with code and strike.',
  )
  assert.equal(await rich.locator('.markdown-marker').count(), 8)
  await page.screenshot({ path: 'test-results/markdown-markers.png' })
  await paragraph.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.waitForFunction(
    () =>
      window.getSelection()?.toString() ===
      'Some bold and italic with code and strike.',
  )
  const copied = await rich.evaluate((element) => {
    const clipboardData = new DataTransfer()
    element.dispatchEvent(
      new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
    return {
      text: clipboardData.getData('text/plain'),
      html: clipboardData.getData('text/html'),
    }
  })
  assert.equal(copied.text, 'Some bold and italic with code and strike.')
  assert.doesNotMatch(copied.html, /markdown-marker|data-marker/)
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).markdown,
    source,
  )
  await rich.press('Control+a')
  await page.waitForFunction(
    () => !document.querySelector('.tiptap .markdown-marker'),
  )
  await rich.locator('p').nth(1).click()
  await rich.locator('p').nth(1).locator('.markdown-marker').first().waitFor()
  assert.equal(await paragraph.locator('.markdown-marker').count(), 0)
  await rich.locator('pre').click()
  await page.waitForFunction(
    () => !document.querySelector('.tiptap .markdown-marker'),
  )
  assert.equal(await rich.locator('.markdown-marker').count(), 0)
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('x')
  await waitForAsync(page, async () =>
    (await window.hibi.getDocument()).markdown.includes('x'),
  )
  assert.equal(
    await paragraph.textContent(),
    'Some bold and italic with code and strike.x',
  )
  const changeSetting = async (enabled) => {
    await clickMenu(app, 'Settings')
    await page.getByRole('tab', { name: /^editor$/i }).click()
    await page
      .getByRole('checkbox', { name: /^show markdown markers$/i })
      .setChecked(enabled)
    await page.getByRole('button', { name: /back to app/i }).click()
  }
  await changeSetting(false)
  await paragraph.click()
  assert.equal(await rich.locator('.markdown-marker').count(), 0)
  await pressShortcut(
    app,
    process.platform === 'darwin' ? 'Meta+z' : 'Control+z',
  )
  await waitForAsync(
    page,
    async (source) => (await window.hibi.getDocument()).markdown === source,
    source,
  )
  await page.reload()
  await paragraph.click()
  assert.equal(await rich.locator('.markdown-marker').count(), 0)
  assert.equal(
    await page.evaluate(() => localStorage.getItem('markdown-markers')),
    'false',
  )
  await changeSetting(true)
  await paragraph.click()
  await paragraph.locator('.markdown-marker').first().waitFor()
  await page.getByRole('button', { name: /^side-by-side$/i }).click()
  const code = page.getByRole('textbox', { name: /markdown editor/i })
  await code.click()
  await page.waitForFunction(
    () => !document.querySelector('.tiptap .markdown-marker'),
  )
  assert.equal(await rich.locator('.markdown-marker').count(), 0)
  await paragraph.click()
  assert.equal(await rich.getAttribute('aria-readonly'), 'true')
  assert.equal(await rich.locator('.markdown-marker').count(), 0)
  await page.getByRole('button', { name: /^normal$/i }).click()
  await paragraph.click()
  await paragraph.locator('.markdown-marker').first().waitFor()
  assert.equal(await rich.getAttribute('aria-readonly'), 'false')
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).markdown,
    source,
  )
  assert.deepEqual(errors, [])
})
