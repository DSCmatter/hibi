import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { clickMenu } from './keyboard.mjs'

test('scoped views preserve sessions, pin documents, contain lazy failures, and revoke handles', {
  timeout: 40000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-views-'))
  const directory = join(profile, 'installed-addons', 'view-fixture')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'hibi-addon.json'),
    JSON.stringify({
      id: 'view-fixture',
      name: 'View fixture',
      description: 'Scoped view fixture',
      kind: 'extension',
      authors: [{ displayName: 'Test' }],
      apiVersion: 2,
      version: '1.0.0',
      capabilities: ['ui'],
      entry: 'index.js',
    }),
  )
  await writeFile(
    join(directory, '.hibi-install.json'),
    JSON.stringify({
      hash: 'a'.repeat(64),
      files: ['index.js', 'hibi-addon.json'],
      source: 'local',
    }),
  )
  await writeFile(
    join(profile, 'addons.json'),
    JSON.stringify({ 'view-fixture': true }),
  )
  await writeFile(
    join(directory, 'index.js'),
    `export default ({ React }) => ({ start(context) {
    const h = React.createElement;
    function Content(props) {
      const [count, setCount] = React.useState(0);
      window.viewProps ??= {}; window.viewProps[props.instanceId] = props;
      return h('div', null, h('p', {className:'bound-text'}, props.document?.markdown),
        h('button', {onClick:() => setCount(count + 1)}, 'Count ' + count));
    }
    const panel = context.views.register({ id:'panel', label:'Fixture panel', location:'panel', lifetime:'session', Content });
    const staged = panel.open({id:'staged'});
    if (panel.open({id:'staged'}) !== staged) throw Error('staged instance was not reused');
    staged.hide();
    const follow = context.views.register({ id:'follow', label:'Following view', Content });
    const lazy = React.lazy(() => new Promise(resolve => { window.finishView = () => resolve({default:Content}); }));
    const slow = context.views.register({ id:'slow', label:'Slow panel', location:'panel', Content:lazy });
    const broken = context.views.register({ id:'broken', label:'Broken panel', location:'panel', Content() { throw Error('view failure'); } });
    window.viewsFixture = { context, panel, follow, slow, broken, staged, handles: {} };
  }});`,
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
  const page = await app.firstWindow()
  page.setDefaultTimeout(7000)
  const editor = page.getByRole('textbox', {
    name: 'Document editor',
    exact: true,
  })
  await editor.fill('first document')
  await page.waitForFunction(() => window.viewsFixture)
  await page.evaluate(() => window.viewsFixture.staged.show())
  await page
    .getByRole('region', { name: 'Fixture panel' })
    .getByRole('button', { name: 'Count 0' })
    .waitFor()
  await page.evaluate(() => window.viewsFixture.staged.close())
  const first = await page.evaluate(() => {
    const f = window.viewsFixture
    f.handles.pinned = f.panel.open({ id: 'first', binding: 'pinned' })
    return f.context.editor.getDocument().tabId
  })
  const panel = page.getByRole('region', { name: 'Fixture panel' })
  await panel.getByRole('button', { name: 'Count 0' }).click()
  await page.evaluate(() => window.viewsFixture.handles.pinned.hide())
  await panel.waitFor({ state: 'hidden' })
  await page.evaluate(() => window.viewsFixture.handles.pinned.show())
  await panel.getByRole('button', { name: 'Count 1' }).waitFor()
  await page.evaluate(() => {
    window.viewsFixture.handles.follow = window.viewsFixture.follow.open()
  })
  await clickMenu(app, 'New')
  await editor.fill('second document')
  assert.equal(
    await panel.locator('.bound-text').textContent(),
    'first document',
  )
  const sidebar = page.getByRole('complementary', { name: 'Following view' })
  await page.waitForFunction(
    () =>
      document.querySelector('.addon-sidebar .bound-text')?.textContent ===
      'second document',
  )
  const focused = await page.evaluate(() =>
    window.viewProps['view-fixture.panel:first'].focusDocument(),
  )
  assert.equal(focused, true)
  await page.waitForFunction(
    (id) => window.viewsFixture.context.editor.getDocument().tabId === id,
    first,
  )
  assert.equal(await editor.textContent(), 'first document')
  await page.evaluate(() => {
    window.viewsFixture.handles.slow = window.viewsFixture.slow.open()
  })
  await page.getByText('Loading view…', { exact: true }).waitFor()
  await editor.fill('still editable')
  await page.evaluate(() => window.finishView())
  await page
    .getByRole('region', { name: 'Slow panel' })
    .getByRole('button', { name: 'Count 0' })
    .waitFor()
  await page.evaluate(() => window.viewsFixture.broken.open())
  await page
    .getByRole('alert')
    .filter({ hasText: 'Could not load this view.' })
    .waitFor()
  assert.equal(await editor.getAttribute('contenteditable'), 'true')
  await page.evaluate(() => window.viewsFixture.handles.pinned.show())
  assert.equal(
    await panel.locator('.bound-text').textContent(),
    'first document',
  )
  await page.evaluate(() => window.viewsFixture.panel.dispose())
  await panel.waitFor({ state: 'hidden' })
  await page.evaluate(() => window.viewsFixture.handles.pinned.show())
  assert.equal(await page.locator('.addon-panel:not([hidden])').count(), 0)
  await clickMenu(app, 'Settings')
  await page.getByRole('tab', { name: 'Addons', exact: true }).click()
  await page.locator('#addon-view-fixture').uncheck()
  await page.getByRole('button', { name: 'Back to app', exact: true }).click()
  assert.equal(await page.locator('[data-addon-view]').count(), 0)
  assert.equal(await editor.textContent(), 'still editable')
  assert.equal(await sidebar.count(), 0)
})
