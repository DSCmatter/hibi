import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { clickMenu } from './keyboard.mjs'

test('default diagnostics preserve editing, use the raw bridge and export only safe records', {
  timeout: 30000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-local-log-app-'))
  const profile = join(root, 'profile')
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  t.after(async () => {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 })
      })
      .catch(() => {})
    await app.close().catch(() => {})
    await rm(root, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.setDefaultTimeout(6000)
  const editor = page.getByRole('textbox', { name: /document editor/i })
  await editor.waitFor()
  const config = await page.evaluate(async () =>
    JSON.parse(await window.hibiDiagnostics.configuration()),
  )
  assert.equal(config.profile, 'debug')
  assert.ok(config.artifacts.length > 0)
  const sentinel = 'PRIVATE DIAGNOSTIC DOCUMENT 雪'
  await editor.fill(sentinel)
  const captured = await page.evaluate(
    ({ config, sentinel }) => {
      const frames = [[config.artifacts[0][1], 12, 3]]
      return {
        invalid: window.hibiDiagnostics.record(
          JSON.stringify({
            code: 'RENDERER_ERROR',
            stackStatus: 'unavailable',
            message: sentinel,
          }),
        ),
        forged: window.hibiDiagnostics.record(
          JSON.stringify({
            code: 'MAIN_EXCEPTION',
            stackStatus: 'unavailable',
          }),
        ),
        accepted: window.hibiDiagnostics.record(
          JSON.stringify({
            code: 'RENDERER_ERROR',
            stackStatus: 'captured',
            frames,
          }),
        ),
      }
    },
    { config, sentinel },
  )
  assert.deepEqual(captured, { invalid: false, forged: false, accepted: true })
  const directory = join(profile, 'logs', 'debug')
  let logs = ''
  const end = Date.now() + 6000
  while (Date.now() < end) {
    const names = await readdir(directory).catch(() => [])
    logs = (
      await Promise.all(
        names.map((name) =>
          readFile(join(directory, name), 'utf8').catch(() => ''),
        ),
      )
    ).join('\n')
    if (logs.includes('RENDERER_ERROR')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(logs.includes('RENDERER_ERROR'))
  assert.ok(logs.includes('44.3.0'))
  assert.ok(!logs.includes(sentinel))
  assert.ok(!logs.includes(profile))
  assert.equal(
    (await page.evaluate(() => window.hibi.getDocument())).markdown,
    sentinel,
  )
  const reportPath = join(root, 'safe-report.txt')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, reportPath)
  await clickMenu(app, 'Save diagnostic report…')
  let report = ''
  for (let i = 0; i < 100 && !report; i++) {
    report = await readFile(reportPath, 'utf8').catch(() => '')
    if (!report) await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.ok(report.includes('RENDERER_ERROR'))
  assert.ok(!report.includes(sentinel))
  assert.ok(Buffer.byteLength(report) <= 64 * 1024)
})
