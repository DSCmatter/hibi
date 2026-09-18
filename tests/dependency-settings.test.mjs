import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { waitForAsync } from './poll.mjs'

test('dependency settings discover addon requirements, manage shared paths, and preserve editor drafts', {
  timeout: 60000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-dependency-settings-'))
  const addon = join(profile, 'installed-addons', 'dependency-fixture')
  await mkdir(addon, { recursive: true })
  await writeFile(
    join(addon, 'hibi-addon.json'),
    JSON.stringify({
      id: 'dependency-fixture',
      name: 'Dependency fixture',
      kind: 'extension',
      description: 'Dependency API fixture',
      apiVersion: 2,
      version: '1.0.0',
      authors: [{ displayName: 'Test' }],
      capabilities: [],
      entry: 'index.js',
      dependencies: [
        {
          id: 'fixture-cli',
          name: 'Fixture CLI',
          command: 'hibi-missing-fixture-cli',
          homepage: 'https://example.com/install',
          reason: 'Fixture rendering.',
          install: {
            brew: { package: 'hibi-missing-fixture-cli' },
            winget: 'Hibi.MissingFixtureCLI',
          },
        },
      ],
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
    join(addon, 'index.js'),
    'export default () => ({ start(context) { window.fixtureDependencies = context.dependencies; } })',
  )
  await writeFile(
    join(profile, 'addons.json'),
    JSON.stringify({ 'dependency-fixture': true, rst: true }),
  )
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  t.after(async () => {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 })
    })
    await app.close()
    await rm(profile, { recursive: true, force: true })
  })
  await app.evaluate(({ dialog, shell }, executable) => {
    globalThis.dependencyPrompts = []
    globalThis.dependencyUrls = []
    dialog.showMessageBox = async (_window, options) => {
      globalThis.dependencyPrompts.push(options)
      return { response: 0 }
    }
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [executable],
    })
    shell.openExternal = async (url) => {
      globalThis.dependencyUrls.push(url)
    }
  }, process.execPath)
  const page = await app.firstWindow()
  page.setDefaultTimeout(10000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1200, height: 900 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const editor = page.getByRole('textbox', { name: /document editor/i })
  await editor.fill('Keep this unsaved draft.')
  await page.waitForFunction(() => !!window.fixtureDependencies)
  await assert.rejects(
    page.evaluate(() => window.fixtureDependencies.check('undeclared')),
    /did not declare/,
  )
  const [missing] = await page.evaluate(() => window.fixtureDependencies.list())
  assert.equal(missing.status, 'missing')
  if (missing.installer) {
    await page.evaluate(() => window.fixtureDependencies.install('fixture-cli'))
    assert.equal(
      (await app.evaluate(() => globalThis.dependencyPrompts)).length,
      1,
    )
  }
  await page.evaluate(() => window.fixtureDependencies.openSettings())
  const panel = page.getByRole('tabpanel', {
    name: 'Dependencies',
    exact: true,
  })
  await panel.waitFor()
  const checkSpacing = async () => {
    const [heading, description, search] = await Promise.all([
      panel
        .getByRole('heading', { name: 'Dependencies', exact: true })
        .boundingBox(),
      panel.locator('.dependency-intro .plugin-description').boundingBox(),
      panel
        .getByRole('searchbox', { name: 'Filter dependencies', exact: true })
        .boundingBox(),
    ])
    assert.ok(
      description.y - heading.y - heading.height >= 12,
      'heading and description have separate spacing',
    )
    assert.ok(
      search.y - description.y - description.height >= 16,
      'description does not touch the filter',
    )
  }
  await checkSpacing()
  const filter = panel.getByRole('searchbox', {
    name: 'Filter dependencies',
    exact: true,
  })
  await filter.fill('fixture cli')
  let card = panel.getByRole('region', { name: 'Fixture CLI', exact: true })
  await card.getByText('Not found', { exact: true }).waitFor()
  await card.getByRole('link', { name: /installation guide/i }).click()
  assert.deepEqual(await app.evaluate(() => globalThis.dependencyUrls), [
    'https://example.com/install',
  ])
  await card
    .getByRole('button', { name: 'Choose executable…', exact: true })
    .click()
  await card.getByText('Available', { exact: true }).waitFor()
  const [custom] = await page.evaluate(() => window.fixtureDependencies.list())
  assert.equal(custom.path, await realpath(process.execPath))
  assert.equal(custom.customPath, true)
  assert.match(custom.version, /^v\d+/)
  await filter.fill('pandoc')
  card = panel.getByRole('region', { name: 'Pandoc', exact: true })
  await card.waitFor()
  const all = await page.evaluate(() => window.hibi.getDependencies())
  const pandoc = all.filter((tool) => tool.id === 'pandoc')
  assert.equal(pandoc.length, 1)
  assert.ok(pandoc[0].addons.length >= 3)
  assert.ok(pandoc[0].addons.some((addon) => addon.enabled))
  assert.ok(pandoc[0].addons.some((addon) => !addon.enabled))
  await card
    .getByRole('button', { name: 'Choose executable…', exact: true })
    .click()
  await waitForAsync(
    page,
    async () =>
      (await window.hibi.getDependencies()).find((tool) => tool.id === 'pandoc')
        .customPath,
  )
  const tools = await page.evaluate(() =>
    window.hibi.queryAddon('rst', 'tools'),
  )
  assert.ok(
    tools.diagnostics.includes(await realpath(process.execPath)),
    'format workers use the managed path',
  )
  const preferences = JSON.parse(
    await readFile(join(profile, 'dependencies.json'), 'utf8'),
  )
  assert.equal(preferences[pandoc[0].key], process.execPath)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/dependency-settings.png' })
  await page.setViewportSize({ width: 640, height: 900 })
  const settings = page.getByRole('main', { name: 'Settings', exact: true })
  await page.waitForFunction(() => {
    const settings = document.querySelector('main.settings-screen')
    return (
      settings?.getAttribute('data-sidebar-overlay') === 'true' &&
      settings.getAttribute('data-sidebar') === 'false'
    )
  })
  await checkSpacing()
  assert.equal(
    await settings
      .locator('.settings-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  )
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('.settings-sidebar .sidebar')
    return sidebar && getComputedStyle(sidebar).visibility === 'hidden'
  })
  await filter.focus()
  await page.mouse.move(630, 890)
  await page.screenshot({ path: 'test-results/dependency-settings-narrow.png' })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.waitForFunction(() => {
    const settings = document.querySelector('main.settings-screen')
    return (
      settings?.getAttribute('data-sidebar-overlay') === 'false' &&
      settings.getAttribute('data-sidebar') === 'true'
    )
  })
  await card.getByRole('button', { name: 'Use PATH', exact: true }).click()
  await waitForAsync(
    page,
    async () =>
      !(await window.hibi.getDependencies()).find(
        (tool) => tool.id === 'pandoc',
      ).customPath,
  )
  await filter.fill('no-such-tool')
  await panel.getByText('No matching dependencies', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Addons', exact: true }).click()
  await page.locator('#addon-dependency-fixture').click()
  await waitForAsync(
    page,
    async () =>
      !(await window.hibi.getAddonStates()).find(
        (addon) => addon.id === 'dependency-fixture',
      ).enabled,
  )
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
  await assert.rejects(
    page.evaluate(() => window.fixtureDependencies.list()),
    /Enable this addon/,
  )
  await page.getByRole('tab', { name: 'Dependencies', exact: true }).click()
  await filter.fill('fixture cli')
  await panel
    .getByRole('region', { name: 'Fixture CLI', exact: true })
    .getByText('Required · Addon disabled', { exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Back to app', exact: true }).click()
  assert.equal(await editor.textContent(), 'Keep this unsaved draft.')
  assert.deepEqual(errors, [])
})
