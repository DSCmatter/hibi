import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { launchBenchmarkApp, waitForEditor } from './benchmark-flows.mjs'

if (process.platform !== 'darwin')
  throw new Error('This window-reopen trace currently supports macOS only.')

const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'))
const root = await mkdtemp(join(tmpdir(), 'hibi-log-startup-trace-'))
const samples = []
try {
  for (const variant of manifest.variants) {
    const profile = join(root, variant.profile)
    await mkdir(profile)
    const app = await launchBenchmarkApp(profile, variant.directory)
    try {
      await waitForEditor(await app.firstWindow())
      await app.context().addInitScript(() => {
        // Exactly the existing readiness predicate, observed in the renderer.
        // It stops at readiness; no text, whole DOM or permanent observer.
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
            window.diagnosticReadiness =
              performance.timeOrigin + performance.now()
          } else if (performance.now() < deadline) requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      })
      for (let run = 0; run < 8; run++) {
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
          ready: window.diagnosticReadiness,
          origin: performance.timeOrigin,
          milestones: performance
            .getEntriesByType('mark')
            .filter((e) => e.name.startsWith('hibi:'))
            .map((e) => ({ name: e.name, time: e.startTime })),
        }))
        samples.push({
          profile: variant.profile,
          run,
          originalEndpointMs: observed - start,
          rendererReadyMs: renderer.ready ? renderer.ready - start : null,
          ...renderer,
        })
      }
    } finally {
      await app.close()
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
console.log(JSON.stringify({ revision: manifest.revision, samples }, null, 2))
