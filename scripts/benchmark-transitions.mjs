import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pressShortcut } from '../tests/keyboard.mjs'
import { launchBenchmarkApp, waitForEditor } from './benchmark-flows.mjs'

// Pass another built checkout to compare the same sampler against a baseline.
const entry = resolve(process.argv[2] ?? '.')
const runs = Number(process.env.HIBI_BENCH_RUNS ?? 3)
if (!Number.isInteger(runs) || runs < 1) throw new Error('Invalid run count.')
const samples = []
for (let run = 0; run < runs; run++) {
  const profile = await mkdtemp(join(tmpdir(), 'hibi-transitions-'))
  let app
  try {
    app = await launchBenchmarkApp(profile, entry)
    const page = await app.firstWindow()
    await waitForEditor(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (const phase of ['first', 'repeat']) {
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              const start = performance.now()
              let previous = start
              const frames = []
              let opened = null
              window.transitionSample = new Promise((finish) => {
                const frame = () => {
                  const now = performance.now()
                  const dialog = document.querySelector(
                    '.command-palette[open]',
                  )
                  if (dialog && opened === null) opened = now - start
                  frames.push(now - previous)
                  previous = now
                  if (now - start < 800) requestAnimationFrame(frame)
                  else finish({ opened, frames })
                }
                requestAnimationFrame(frame)
              })
              resolve()
            })
          }),
      )
      await pressShortcut(
        app,
        process.platform === 'darwin' ? 'Meta+k' : 'Control+k',
      )
      const { opened, frames } = await page.evaluate(
        () => window.transitionSample,
      )
      if (opened === null) throw new Error('Command palette did not open.')
      samples.push({
        run,
        phase,
        openMs: opened,
        maxFrameMs: Math.max(...frames),
        framesOver25Ms: frames.filter((duration) => duration > 25),
      })
      await page
        .getByRole('combobox', { name: 'Search commands' })
        .press('Escape')
      await page.locator('.command-palette').waitFor({ state: 'hidden' })
    }
  } finally {
    await app?.close()
    await rm(profile, { recursive: true, force: true })
  }
}
console.log(JSON.stringify({ entry, samples }, null, 2))
