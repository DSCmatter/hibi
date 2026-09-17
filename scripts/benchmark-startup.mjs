import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { electron } from '../tests/electron.mjs'

const runs = Number(process.env.HIBI_BENCH_RUNS ?? 5)
if (!Number.isInteger(runs) || runs < 1 || runs > 50)
  throw new Error('Use 1–50 runs.')
const temp = await mkdtemp(join(tmpdir(), 'hibi-benchmark-'))
const samples = []
const minimal = join(temp, 'minimal.cjs')
await writeFile(
  minimal,
  `const {app,BrowserWindow}=require('electron');
app.setPath('userData',app.commandLine.getSwitchValue('user-data-dir'));
app.whenReady().then(()=>{ const win=new BrowserWindow({width:1000,height:720,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.loadURL('data:text/html,<body contenteditable="true" role="textbox" aria-label="Document editor"></body>'); });
app.on('window-all-closed',()=>app.quit());`,
)

async function measure(page, start, app, scenario) {
  const editor = page.getByRole('textbox', {
    name: 'Document editor',
    exact: true,
  })
  await editor.waitFor()
  const editable = performance.now() - start
  const beforeInput = performance.now()
  await editor.press('x')
  await page.waitForFunction(() =>
    document.querySelector('[role="textbox"]')?.textContent.includes('x'),
  )
  const firstInput = performance.now() - beforeInput
  const typing = []
  for (let i = 0; i < 8; i++) {
    const before = performance.now()
    await editor.press('a')
    typing.push(performance.now() - before)
    await new Promise((done) => setTimeout(done, 50))
  }
  const renderer = await page.evaluate(() => ({
    milestones: performance
      .getEntriesByType('mark')
      .filter((entry) => entry.name.startsWith('hibi:'))
      .map((entry) => ({ name: entry.name, ms: entry.startTime })),
    paint: performance
      .getEntriesByType('paint')
      .map((entry) => ({ name: entry.name, ms: entry.startTime })),
    scripts: performance
      .getEntriesByType('resource')
      .filter((entry) => /\.js(?:\?|$)/.test(entry.name))
      .map((entry) => entry.name),
    sourceMounted: !!document.querySelector('.cm-editor'),
  }))
  const main = await app.evaluate(() =>
    performance
      .getEntries()
      .filter((entry) => entry.name.startsWith('hibi:'))
      .map((entry) => ({
        name: entry.name,
        ms: entry.startTime,
        duration: entry.duration,
      })),
  )
  samples.push({ scenario, editable, firstInput, typing, renderer, main })
}

try {
  for (const scenario of ['minimal', 'fresh-profile', 'warm-profile']) {
    for (let run = 0; run < runs; run++) {
      const profile = join(
        temp,
        scenario === 'warm-profile' ? 'warm' : `${scenario}-${run}`,
      )
      await mkdir(profile, { recursive: true })
      const start = performance.now()
      const app = await electron.launch({
        args: [
          scenario === 'minimal' ? minimal : resolve('.'),
          `--user-data-dir=${profile}`,
        ],
      })
      try {
        await app.evaluate(({ dialog }) => {
          dialog.showMessageBox = async () => ({ response: 1 })
        })
        await measure(
          await app.firstWindow(),
          start,
          app,
          scenario === 'warm-profile' && run === 0
            ? 'warm-profile-prime'
            : scenario,
        )
        if (scenario === 'fresh-profile' && process.platform === 'darwin') {
          const closed = (await app.firstWindow()).waitForEvent('close')
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].close(),
          )
          await closed
          const reopening = performance.now()
          const window = app.waitForEvent('window')
          await app.evaluate(({ app }) => app.emit('activate'))
          await measure(await window, reopening, app, 'window-reopen')
        }
      } finally {
        await app.close()
      }
    }
  }
  const chunks = JSON.parse(
    await readFile('out/renderer/startup-bundle.json', 'utf8'),
  )
  const visited = new Set()
  function visit(file) {
    if (visited.has(file)) return
    const chunk = chunks.find((chunk) => chunk.file === file)
    if (!chunk) return
    visited.add(file)
    for (const dependency of chunk.imports) visit(dependency)
  }
  for (const entry of chunks.filter((chunk) => chunk.entry)) visit(entry.file)
  const initial = chunks.filter((chunk) => visited.has(chunk.file))
  const quantile = (values, q) =>
    values.toSorted((a, b) => a - b)[Math.ceil(values.length * q) - 1]
  const summary = [...new Set(samples.map((sample) => sample.scenario))].map(
    (scenario) => {
      const group = samples.filter((sample) => sample.scenario === scenario)
      return {
        scenario,
        runs: group.length,
        editableMedian: quantile(
          group.map((sample) => sample.editable),
          0.5,
        ),
        editableP95: quantile(
          group.map((sample) => sample.editable),
          0.95,
        ),
        firstInputP95: quantile(
          group.map((sample) => sample.firstInput),
          0.95,
        ),
        typingP95: quantile(
          group.flatMap((sample) => sample.typing),
          0.95,
        ),
      }
    },
  )
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        arch: process.arch,
        conditions:
          'Production assets in test Electron; fresh profile is not OS cold-cache; hidden windows; automation latency included.',
        initialBytes: initial.reduce((sum, chunk) => sum + chunk.bytes, 0),
        initialModules: initial.flatMap((chunk) => chunk.modules),
        summary,
        samples,
      },
      null,
      2,
    ),
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
