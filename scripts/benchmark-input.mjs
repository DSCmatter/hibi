import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  benchmarkDocuments,
  launchBenchmarkApp,
  openBenchmarkDocument,
  selectBenchmarkFile,
  typeCharacter,
  waitForEditor,
} from './benchmark-flows.mjs'

const runs = Number(process.env.HIBI_INPUT_RUNS ?? 5)
if (!Number.isInteger(runs) || runs < 1 || runs > 50)
  throw new Error('Use 1–50 runs.')
const foreground = process.env.HIBI_BENCH_FOREGROUND === '1'
const directory = await mkdtemp(join(tmpdir(), 'hibi-input-bench-'))
const fixtures = [
  { name: 'blank.md', title: '', source: '' },
  ...benchmarkDocuments,
]
const samples = []
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ] ?? null
try {
  for (const fixture of fixtures) {
    const file = join(directory, fixture.name)
    await writeFile(file, fixture.source)
    for (let run = 0; run < runs; run++) {
      const profile = join(directory, `${fixture.name}-${run}`)
      await mkdir(profile)
      const app = await launchBenchmarkApp(profile)
      try {
        if (foreground)
          await app.evaluate(({ BrowserWindow }) => {
            const window = BrowserWindow.getAllWindows()[0]
            window.setFocusable(true)
            window.show()
            window.focus()
          })
        const page = await app.firstWindow()
        await waitForEditor(page)
        if (fixture.title) {
          await selectBenchmarkFile(app, file)
          await openBenchmarkDocument(app, page, fixture.title)
        }
        // Test-only instrumentation: none of these wrappers ship in Hibi.
        await page.evaluate(() => {
          const element = document.querySelector('.tiptap')
          const editor = element.editor
          const measurements = {
            transactions: [],
            can: 0,
            serializations: 0,
            lastInput: null,
          }
          window.__hibiInputMeasurements = measurements
          const can = editor.can.bind(editor),
            serialize = editor.getMarkdown.bind(editor)
          editor.can = (...args) => {
            measurements.can++
            return can(...args)
          }
          editor.getMarkdown = (...args) => {
            measurements.serializations++
            return serialize(...args)
          }
          element.addEventListener(
            'beforeinput',
            () => {
              measurements.lastInput = performance.now()
            },
            true,
          )
          const dispatch = editor.view.props.dispatchTransaction
          editor.view.setProps({
            dispatchTransaction(transaction) {
              const start = performance.now(),
                can = measurements.can,
                serializations = measurements.serializations
              try {
                dispatch.call(this, transaction)
              } finally {
                if (
                  transaction.docChanged &&
                  measurements.transactions.length < 256
                ) {
                  measurements.transactions.push({
                    cpuMs: performance.now() - start,
                    inputToModelMs:
                      measurements.lastInput === null
                        ? null
                        : performance.now() - measurements.lastInput,
                    canChecks: measurements.can - can,
                    serializations:
                      measurements.serializations - serializations,
                  })
                  measurements.lastInput = null
                }
              }
            },
          })
        })
        const input = page.getByRole('textbox', {
          name: 'Document editor',
          exact: true,
        })
        const driver = []
        for (let key = 0; key < 20; key++) {
          const previous = await input.textContent()
          const start = performance.now()
          await typeCharacter(page, previous, key ? 'a' : 'x')
          driver.push(performance.now() - start)
        }
        const measured = await page.evaluate(
          () => window.__hibiInputMeasurements,
        )
        samples.push({ fixture: fixture.name, run, driver, ...measured })
      } finally {
        await app.close()
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        arch: process.arch,
        foreground,
        endpoints: {
          driver:
            'locator.press through changed editor DOM text; identical endpoint for first and subsequent keys',
          cpu: 'ProseMirror dispatchTransaction, including synchronous host/addon listeners and instrumentation overhead',
          inputToModel:
            'beforeinput capture through completed document-changing dispatch; not physical presentation',
        },
        summary: fixtures.map((fixture) => {
          const group = samples.filter(
            (sample) => sample.fixture === fixture.name,
          )
          const transactions = group.flatMap((sample) => sample.transactions)
          return {
            fixture: fixture.name,
            runs: group.length,
            cpuMedian: percentile(
              transactions.map((sample) => sample.cpuMs),
              0.5,
            ),
            cpuP95: percentile(
              transactions.map((sample) => sample.cpuMs),
              0.95,
            ),
            inputToModelP95: percentile(
              transactions.flatMap((sample) =>
                sample.inputToModelMs === null ? [] : [sample.inputToModelMs],
              ),
              0.95,
            ),
            firstDriverP95: percentile(
              group.map((sample) => sample.driver[0]),
              0.95,
            ),
            subsequentDriverP95: percentile(
              group.flatMap((sample) => sample.driver.slice(1)),
              0.95,
            ),
            canChecksPerTransaction:
              transactions.reduce((sum, sample) => sum + sample.canChecks, 0) /
              transactions.length,
            serializationsPerTransaction:
              transactions.reduce(
                (sum, sample) => sum + sample.serializations,
                0,
              ) / transactions.length,
          }
        }),
        samples,
      },
      null,
      2,
    ),
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
