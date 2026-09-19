import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { launchBenchmarkApp, waitForEditor } from './benchmark-flows.mjs'

if (process.platform !== 'darwin')
  throw new Error('Window-reopen measurements currently require macOS.')
const directory = resolve(process.argv[2] ?? '.')
const runs = Number(process.argv[3] ?? 8)
if (!Number.isInteger(runs) || runs < 1 || runs > 50)
  throw new Error('Choose 1–50 reopens.')
const profile = await mkdtemp(join(tmpdir(), 'hibi-editor-readiness-'))
const app = await launchBenchmarkApp(profile, directory)
const samples = []
try {
  await waitForEditor(await app.firstWindow())
  await app.context().addInitScript(() => {
    // Same predicate as waitForEditor, stamped inside the renderer. No DOM scan.
    const deadline = performance.now() + 15000
    const poll = () => {
      const editor = document.querySelector(
        '[role="textbox"][aria-label="Document editor"]',
      )
      if (
        editor?.isContentEditable &&
        !editor.closest('[inert]') &&
        editor.getBoundingClientRect().width > 0
      ) {
        window.editorReadiness = performance.timeOrigin + performance.now()
      } else if (performance.now() < deadline) requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
  for (let run = 0; run < runs; run++) {
    await app.evaluate(
      ({ BrowserWindow }) =>
        new Promise((resolve) => {
          const window = BrowserWindow.getAllWindows()[0]
          window.once('closed', resolve)
          window.close()
        }),
    )
    const start = performance.timeOrigin + performance.now()
    const next = app.waitForEvent('window')
    await app.evaluate(({ app }) => app.emit('activate'))
    const page = await next
    await waitForEditor(page)
    const observed = performance.timeOrigin + performance.now()
    const renderer = await page.evaluate(() => ({
      ready: window.editorReadiness,
      origin: performance.timeOrigin,
      milestones: performance
        .getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('hibi:'))
        .map((entry) => ({ name: entry.name, time: entry.startTime })),
    }))
    samples.push({
      run,
      originalEndpointMs: observed - start,
      rendererReadyMs: renderer.ready ? renderer.ready - start : null,
      ...renderer,
    })
  }
} finally {
  await app.close()
  await rm(profile, { recursive: true, force: true })
}
console.log(JSON.stringify({ directory, samples }, null, 2))
