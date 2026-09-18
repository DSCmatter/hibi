import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { clickMenu, pressShortcut } from './keyboard.mjs'

test('settings collapse independently and narrow sidebars overlay full-width desktop content', {
  timeout: 45000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'hibi-sidebar-layout-'))
  const workspace = join(directory, 'notes')
  await mkdir(workspace)
  await writeFile(join(workspace, 'first.md'), '# First\n\nA note.')
  const app = await electron.launch({
    args: [resolve('.'), '--user-data-dir=' + join(directory, 'profile')],
    colorScheme: 'dark',
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(7000)
  await page.setViewportSize({ width: 1000, height: 760 })
  await page.getByRole('textbox', { name: /document editor/i }).waitFor()
  await clickMenu(app, 'Settings')
  const settings = page.locator('.settings-screen')
  const settingsToggle = page.getByRole('button', {
    name: /^toggle settings sidebar$/i,
  })
  const sidebar = page.locator('.settings-sidebar')
  await page.getByRole('tab', { name: /^editor$/i }).click()
  const rowHeight = await sidebar
    .locator('.sidebar-row')
    .first()
    .evaluate((element) => element.offsetHeight)
  const contentGeometry = (selector) =>
    page.locator(selector).evaluate((element) => ({
      x: element.getBoundingClientRect().x,
      width: element.getBoundingClientRect().width,
      inert: element.inert,
    }))
  assert.equal((await contentGeometry('.settings-content')).x, 256)
  await settingsToggle.click()
  await page.waitForFunction(
    () =>
      document.querySelector('.settings-content').getBoundingClientRect().x ===
      0,
  )
  assert.equal(await sidebar.getAttribute('data-open'), 'false')
  await page.getByRole('button', { name: /^back to app$/i }).waitFor()
  await pressShortcut(
    app,
    process.platform === 'darwin' ? 'Meta+/' : 'Control+/',
  )
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'true',
  )
  assert.equal(await page.locator('.app').getAttribute('data-sidebar'), 'false')

  await page.setViewportSize({ width: 480, height: 760 })
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'false',
  )
  assert.deepEqual(await contentGeometry('.settings-content'), {
    x: 0,
    width: 480,
    inert: false,
  })
  await settingsToggle.click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.settings-sidebar .sidebar')
        .getBoundingClientRect().x === 0,
  )
  assert.deepEqual(await contentGeometry('.settings-content'), {
    x: 0,
    width: 480,
    inert: true,
  })
  assert.equal(
    await sidebar
      .locator('.sidebar-row')
      .first()
      .evaluate((element) => element.offsetHeight),
    rowHeight,
  )
  assert.ok((await settingsToggle.boundingBox()).height <= 28)
  await page.keyboard.press('ArrowDown')
  assert.equal(await sidebar.getAttribute('data-open'), 'true')
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'false',
  )
  assert.equal(await settings.getAttribute('hidden'), null)
  await settingsToggle.click()
  const search = page.getByRole('textbox', { name: /^search settings$/i })
  await search.fill('spell check')
  await search.press('Escape')
  assert.equal(await search.inputValue(), '')
  assert.equal(await sidebar.getAttribute('data-open'), 'true')
  await search.press('Escape')
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'false',
  )
  assert.equal(
    await settingsToggle.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  )

  await settingsToggle.click()
  await search.fill('spell check')
  await page.getByRole('treeitem', { name: /^spell check$/i }).click()
  await page.waitForFunction(() => document.activeElement?.id === 'spell-check')
  assert.equal(await sidebar.getAttribute('data-open'), 'false')
  await settingsToggle.click()
  await search.fill('')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.settings-sidebar .sidebar')
        .getBoundingClientRect().x === 0,
  )
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/settings-drawer-open.png' })
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    assert.equal(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('.settings-content')),
      ),
      false,
    )
  }
  await sidebar
    .locator('.sidebar-scrim')
    .click({ position: { x: 440, y: 350 } })
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.settings-sidebar .sidebar'))
        .visibility === 'hidden',
  )
  await page.screenshot({ path: 'test-results/settings-drawer-closed.png' })
  await page.getByRole('button', { name: /^back to app$/i }).click()

  const workspaceToggle = page.getByRole('button', {
    name: /^toggle workspace sidebar$/i,
  })
  await workspaceToggle.click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.workspace-sidebar .sidebar')
        .getBoundingClientRect().x === 0,
  )
  assert.deepEqual(await contentGeometry('.editor-surface'), {
    x: 0,
    width: 480,
    inert: true,
  })
  await page.screenshot({ path: 'test-results/workspace-drawer-open.png' })
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [workspace],
    })
  }, workspace)
  await page.getByRole('button', { name: /^open workspace$/i }).click()
  await page.getByRole('treeitem', { name: /^first.md$/i }).click()
  await page.waitForFunction(
    () => document.querySelector('.app').dataset.sidebar === 'false',
  )
  await page.getByRole('heading', { name: /^first$/i }).waitFor()
  await workspaceToggle.click()
  await page.getByRole('button', { name: /^sidebar views$/i }).click()
  await page.getByRole('menuitem', { name: /^on this page$/i }).click()
  await page.getByRole('treeitem', { name: /^first$/i }).click()
  await page.waitForFunction(
    () => document.querySelector('.app').dataset.sidebar === 'false',
  )
  assert.equal((await contentGeometry('.editor-surface')).inert, false)
  await workspaceToggle.click()
  await page.keyboard.press('Escape')
  assert.equal(
    await workspaceToggle.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
  )

  await page.setViewportSize({ width: 1000, height: 760 })
  await clickMenu(app, 'Settings')
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'true',
  )
  const handle = sidebar.getByRole('separator', { name: /^resize sidebar$/i })
  await page.waitForFunction(
    () =>
      document
        .querySelector('.settings-sidebar .sidebar')
        .getBoundingClientRect().x === 0,
  )
  const bounds = await handle.boundingBox()
  await page.mouse.move(bounds.x + 3, bounds.y + 150)
  await page.mouse.down()
  await page.mouse.move(100, bounds.y + 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(
    () => document.querySelector('.settings-sidebar').dataset.open === 'false',
  )
  await page.setViewportSize({ width: 480, height: 760 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await settingsToggle.click()
  assert.equal(
    await sidebar
      .locator('.sidebar')
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  )
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
})
