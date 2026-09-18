import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { clickMenu } from './keyboard.mjs'

test('addon readmes render safely without activation, and settings headers have spacing and pills', {
  timeout: 60000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-readme-'))
  const folder = join(root, 'installed-addons', 'readme-fixture')
  await mkdir(folder, { recursive: true })
  const source =
    '# Readme fixture\n\n**Bold text** and `code`.\n\n| Name | Value |\n| --- | --- |\n| Test | Works |\n\n- [x] Checked item\n\n![Local image](pixel.png)\n\n[More help](guide.md) · [Website](https://example.com/help)\n\n<img src="missing.png" onerror="window.readmeAttack = true"><script>window.readmeAttack = true</script><iframe src="https://example.com"></iframe><div class="sidebar" style="position:fixed" id="app">Plain content</div>'
  const files = [
    'README.md',
    'guide.md',
    'pixel.png',
    'index.js',
    'hibi-addon.json',
    'escape.md',
  ]
  await writeFile(
    join(folder, 'README.md'),
    `${source}\n\n![Malformed image](bad%zz.png)\n\n[![CI](https://example.com/badge.svg)](https://example.com/build)`,
  )
  await writeFile(
    join(folder, 'guide.md'),
    '# More help\n\n[Back to readme](README.md)',
  )
  await writeFile(
    join(folder, 'pixel.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZwoAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await writeFile(
    join(folder, 'index.js'),
    'window.readmeAddonExecuted = true; export default () => ({start(){}})',
  )
  await writeFile(
    join(folder, 'hibi-addon.json'),
    JSON.stringify({
      id: 'readme-fixture',
      name: 'Readme fixture',
      description: 'Documentation test',
      kind: 'extension',
      apiVersion: 2,
      version: '1.0.0',
      authors: [{ displayName: 'Test author' }],
      entry: 'index.js',
    }),
  )
  await writeFile(
    join(folder, '.hibi-install.json'),
    JSON.stringify({ hash: 'a'.repeat(64), files }),
  )
  const outside = join(root, 'outside.md')
  await writeFile(outside, 'private data')
  // Windows developer mode may prohibit symlinks; path traversal is tested everywhere.
  if (process.platform !== 'win32')
    await symlink(outside, join(folder, 'escape.md'))
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${root}`],
  })
  t.after(async () => {
    await app.close()
    await rm(root, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(10000)
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      globalThis.readmeLink = url
    }
  })
  await page
    .getByRole('textbox', { name: 'Document editor', exact: true })
    .waitFor()
  const before = await page.evaluate(() => window.hibi.getDocument())
  const read = (id, path) =>
    page.evaluate(
      ([id, path]) => window.hibi.getAddonDocumentation(id, path),
      [id, path],
    )
  for (const { id } of await page.evaluate(() =>
    window.hibi.getAddonStates(),
  )) {
    const result = await read(id, 'README.md')
    assert.equal(result.kind, 'markdown')
    assert.match(result.content, /^# /)
  }
  assert.match(
    (await read('keybeats', 'LICENSE.keybeats.md')).content,
    /MIT License/,
  )
  assert.match(
    (await read('typst', '../../../docs/editing/typst.md')).content,
    /^# /,
  )
  for (const [id, path] of [
    ['missing', 'README.md'],
    ['readme-fixture', '../../outside.md'],
    ['readme-fixture', 'index.js'],
    ['keybeats', '../../useraddons/private/README.md'],
    ['keybeats', '/etc/passwd'],
  ])
    await assert.rejects(read(id, path))
  if (process.platform !== 'win32')
    await assert.rejects(read('readme-fixture', 'escape.md'))
  await clickMenu(app, 'Settings')
  await page.getByRole('tab', { name: 'Hotkeys', exact: true }).click()
  const gap = await page
    .locator('#settings-hotkeys')
    .evaluate(
      (panel) =>
        panel.querySelector('.settings-description').getBoundingClientRect()
          .top - panel.querySelector('h1').getBoundingClientRect().bottom,
    )
  assert.ok(gap >= 12, `heading gap: ${gap}`)
  await page.getByRole('tab', { name: 'Addons', exact: true }).click()
  const filter = page.getByRole('searchbox', {
    name: 'Filter addons',
    exact: true,
  })
  await filter.fill('readme fixture')
  const row = page.locator('[data-setting-id="addon-readme-fixture"]')
  assert.equal(await row.getByRole('checkbox').isChecked(), false)
  const button = row.getByRole('button', { name: 'View readme', exact: true })
  await button.click()
  const modal = page.getByRole('dialog', {
    name: 'Readme fixture',
    exact: true,
  })
  await modal
    .getByRole('heading', { name: 'Readme fixture', level: 1 })
    .waitFor()
  assert.equal(await modal.locator('strong').innerText(), 'Bold text')
  assert.equal(await modal.locator('table td').count(), 2)
  assert.equal(await modal.getByRole('checkbox').isChecked(), true)
  assert.equal(await modal.getByRole('checkbox').isDisabled(), true)
  await modal.getByText('Malformed image', { exact: true }).waitFor()
  await page.waitForFunction(
    () => document.querySelector('.addon-readme img')?.naturalWidth > 0,
  )
  assert.equal(
    await modal.locator('script, iframe, [onerror], .sidebar, #app').count(),
    0,
  )
  assert.equal(await page.evaluate(() => window.readmeAttack), undefined)
  assert.equal(await page.evaluate(() => window.readmeAddonExecuted), undefined)
  await modal.getByRole('link', { name: 'CI', exact: true }).click()
  assert.equal(
    await app.evaluate(() => globalThis.readmeLink),
    'https://example.com/build',
  )
  await modal.getByRole('link', { name: 'Website' }).click()
  assert.equal(
    await app.evaluate(() => globalThis.readmeLink),
    'https://example.com/help',
  )
  await modal.getByRole('link', { name: 'More help', exact: true }).click()
  await modal.getByRole('heading', { name: 'More help', level: 1 }).waitFor()
  await modal.getByRole('button', { name: 'Back', exact: true }).click()
  await modal
    .getByRole('heading', { name: 'Readme fixture', level: 1 })
    .waitFor()
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'hidden' })
  assert.equal(
    await button.evaluate((element) => element === document.activeElement),
    true,
  )
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).markdown,
    before.markdown,
  )
  await filter.fill('keybeats')
  const keybeats = page.locator('[data-setting-id="addon-keybeats"]')
  if (!(await keybeats.getByRole('checkbox').isChecked()))
    await keybeats.getByRole('checkbox').click()
  await page.getByRole('tab', { name: /^keybeats$/i, exact: true }).click()
  const panel = page.getByRole('tabpanel', { name: /^keybeats$/i, exact: true })
  const pills = await panel
    .locator('.addon-metadata > span')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const css = getComputedStyle(element)
        return {
          radius: css.borderRadius,
          border: css.borderTopWidth,
          height: element.getBoundingClientRect().height,
        }
      }),
    )
  assert.ok(pills.length >= 4)
  assert.ok(
    pills.every(
      (pill) =>
        pill.radius === '999px' && pill.border === '1px' && pill.height >= 20,
    ),
  )
  await mkdir('.cache', { recursive: true })
  await panel.screenshot({ path: '.cache/addon-preview.png' })
  await panel.getByRole('button', { name: 'View readme', exact: true }).click()
  const keyReadme = page.getByRole('dialog', {
    name: /^keybeats$/i,
    exact: true,
  })
  await keyReadme
    .getByRole('heading', { name: 'keyBeats for Hibi', level: 1 })
    .waitFor()
  await keyReadme.screenshot({ path: '.cache/addon-readme.png' })
  await page.keyboard.press('Escape')
  await keyReadme.waitFor({ state: 'hidden' })
  await app.evaluate(({ BrowserWindow, nativeTheme }) => {
    BrowserWindow.getAllWindows()[0].setSize(480, 720)
    nativeTheme.themeSource = 'dark'
  })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.waitForFunction(() => innerWidth === 480)
  await page.getByRole('tab', { name: 'Addons', exact: true }).click()
  await filter.fill('readme fixture')
  const bounds = await row.evaluate((element) => {
    const row = element.getBoundingClientRect()
    const actions = element
      .querySelector('.addon-actions')
      .getBoundingClientRect()
    return { left: actions.left - row.left, right: row.right - actions.right }
  })
  assert.ok(bounds.left >= -1 && bounds.right >= -1, JSON.stringify(bounds))
  await row.screenshot({ path: '.cache/addon-preview-narrow-dark.png' })
  assert.equal(
    JSON.parse(await readFile(join(root, 'addons.json'), 'utf8'))[
      'readme-fixture'
    ],
    undefined,
  )
})
