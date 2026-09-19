import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { app, utilityProcess } from 'electron'
import {
  attachDiagnosticService,
  diagnosticServiceName,
  expectDiagnosticStop,
  reportOwnedFailure,
} from '../../main/local-diagnostics/owned'
import type { AddonManifest, NativeAddon, NativeAddonContext } from '../api'
import { type LatexPackageTask, packageName } from '../math/packages'
import { formatImage } from './format-image-native'
import { type FormatResult, formatSpec } from './format-specs'
import type { FormatJob } from './format-worker'

const active = new Set<() => void>()
app.on('before-quit', () => {
  for (const cancel of active) cancel()
})
type Input = {
  source: string
  documentId?: string
  kind?: 'html' | 'pdf'
  html?: string
  export?: boolean
}
function input(value: unknown): Input {
  const data = value as Input | null
  if (
    !data ||
    typeof data.source !== 'string' ||
    Buffer.byteLength(data.source) > 2 * 1024 * 1024 ||
    (data.export !== undefined && typeof data.export !== 'boolean') ||
    (data.documentId !== undefined &&
      (typeof data.documentId !== 'string' || data.documentId.length > 128))
  )
    throw new Error('Could not read this document for preview.')
  return data
}

export function nativeFormat(manifest: AddonManifest): NativeAddon {
  const spec = formatSpec(manifest)
  const owned = new Set<() => void>()
  let cached: { key: string; result: FormatResult } | undefined
  let runningPreview: (() => void) | undefined
  const latexCache = join(app.getPath('userData'), 'latex-packages')
  let latexWork: Promise<unknown> = Promise.resolve()
  let generation = 0
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const owner = generation
    const next = latexWork.then(() => {
      if (owner !== generation) throw new Error('The LaTeX addon was disabled.')
      return operation()
    })
    latexWork = next.catch(() => {})
    return next
  }
  const key = (data: Input) => JSON.stringify([data.documentId, data.source])
  async function execute(
    data: Input,
    context: NativeAddonContext,
    run = false,
    tools = false,
    packages?: LatexPackageTask,
  ) {
    const owner = generation
    const note = packages ? null : await context.document.path(data.documentId)
    const toolPaths = Object.fromEntries(
      await Promise.all(
        (manifest.dependencies ?? []).map(async (dependency) => [
          dependency.command,
          await context.dependencies.resolve(dependency.id),
        ]),
      ),
    )
    if (spec.engine === 'latex') await mkdir(latexCache, { recursive: true })
    const scratch = await mkdtemp(join(tmpdir(), 'hibi-format-'))
    // Explicit runs use a temporary sibling source so relative project imports keep working.
    const entry = join(
      run && note ? dirname(note) : scratch,
      `.hibi-run-${randomUUID()}.${spec.extensions[0]}`,
    )
    let cancel: (() => void) | undefined
    try {
      if (run) await writeFile(entry, data.source, { flag: 'wx', mode: 0o600 })
      if (owner !== generation) throw new Error('Document rendering canceled.')
      const diagnosticName = diagnosticServiceName('format')
      const worker = utilityProcess.fork(
        join(app.getAppPath(), 'out/main/format-worker.js'),
        [],
        {
          serviceName: diagnosticName,
          stdio: 'pipe',
          ...(app.isPackaged
            ? {
                env: {
                  ...process.env,
                  ESBUILD_BINARY_PATH: createRequire(import.meta.url)
                    .resolve(
                      `@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`,
                    )
                    .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
                },
              }
            : {}),
        },
      )
      attachDiagnosticService(worker, diagnosticName)
      const children = new Set<number>()
      worker.stdout?.on('data', () => {})
      worker.stderr?.on('data', () => {})
      return await new Promise<FormatResult>((resolve, reject) => {
        let settled = false
        const finish = (
          error?: Error,
          result?: FormatResult,
          observedExit = false,
        ) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          for (const pid of children) {
            try {
              if (process.platform === 'win32')
                spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
                  windowsHide: true,
                  stdio: 'ignore',
                })
              else process.kill(-pid, 'SIGKILL')
            } catch {
              /* The compiler already exited. */
            }
          }
          if (!observedExit) expectDiagnosticStop(worker)
          if (worker.pid) {
            try {
              process.kill(worker.pid, 'SIGKILL')
            } catch {
              worker.kill()
            }
          } else worker.kill()
          if (error) reject(error)
          else resolve(result ?? {})
        }
        cancel = () => finish(new Error('Document rendering canceled.'))
        owned.add(cancel)
        active.add(cancel)
        if (!run && !tools && !packages && !data.export) {
          runningPreview?.()
          runningPreview = cancel
        }
        const timer = setTimeout(
          () => {
            reportOwnedFailure('COMPILER_TIMEOUT', 'format')
            finish(
              new Error(
                packages
                  ? 'The package request timed out. Try again.'
                  : `The preview took longer than ${run ? 90 : 15} seconds. Try again.`,
              ),
            )
          },
          run || packages ? 90000 : 15000,
        )
        worker.once('error', (error) => {
          reportOwnedFailure('COMPILER_PROCESS_FAILED', 'format', error)
          finish(new Error(String(error)))
        })
        worker.once('exit', () =>
          finish(new Error('The preview stopped. Try again.'), undefined, true),
        )
        worker.on(
          'message',
          (message: {
            child?: number
            closedChild?: number
            result?: FormatResult
            error?: string
          }) => {
            if (
              message.child &&
              Number.isSafeInteger(message.child) &&
              message.child > 0
            )
              children.add(message.child)
            else if (message.closedChild) children.delete(message.closedChild)
            else if (message.error) finish(new Error(message.error))
            else if (message.result) finish(undefined, message.result)
          },
        )
        worker.postMessage({
          spec,
          source: data.source,
          scratch,
          entry,
          run,
          tools,
          toolPaths,
          ...(spec.engine === 'latex' ? { latexCache } : {}),
          ...(packages ? { packages } : {}),
        } satisfies FormatJob)
      })
    } finally {
      if (cancel) {
        owned.delete(cancel)
        active.delete(cancel)
        if (runningPreview === cancel) runningPreview = undefined
      }
      if (run) await rm(entry, { force: true })
      await rm(scratch, { recursive: true, force: true })
    }
  }
  const current = (data: Input, context: NativeAddonContext) => {
    const document = context.document.get()
    if (document.id !== data.documentId || document.markdown !== data.source)
      throw new Error('The document changed. Run the current version again.')
    return document
  }
  return {
    id: spec.id,
    stop() {
      generation += 1
      for (const cancel of owned) cancel()
      cached = undefined
    },
    queries: {
      async render(value, context) {
        const data = input(value)
        if (cached?.key === key(data)) return cached.result
        if (spec.engine === 'latex' && !data.export) return {}
        const result = await execute(data, context)
        return result
      },
      tools: (_value, context) => execute({ source: '' }, context, false, true),
      ...(spec.engine === 'latex'
        ? {
            packages: (_value: unknown, context: NativeAddonContext) =>
              serialized(
                async () =>
                  (await execute({ source: '' }, context, false, false, {}))
                    .packages,
              ),
            'download-package': (
              value: unknown,
              context: NativeAddonContext,
            ) => {
              const name = packageName(value)
              return serialized(
                async () =>
                  (
                    await execute({ source: '' }, context, false, false, {
                      name,
                    })
                  ).packages,
              )
            },
            'clear-packages': () =>
              serialized(async () => {
                await rm(latexCache, { recursive: true, force: true })
              }),
          }
        : {}),
      image: formatImage,
    },
    methods: {
      create: (_value, context) =>
        context.document.create(`untitled.${spec.extensions[0]}`, ''),
      async run(value, context) {
        const data = input(value)
        current(data, context)
        const compile = async () => {
          current(data, context)
          const result = {
            ...(await execute(data, context, true)),
            executed: true,
          }
          cached = { key: key(data), result }
          return result
        }
        return spec.engine === 'latex' ? serialized(compile) : compile()
      },
      async export(value, context) {
        const data = input(value)
        const document = current(data, context)
        let bytes: Uint8Array
        if (data.kind === 'pdf') {
          const result = cached?.key === key(data) ? cached.result : undefined
          if (!result?.pdf)
            throw new Error(
              'Compile the document again before exporting its PDF.',
            )
          bytes = result.pdf
        } else if (
          data.kind === 'html' &&
          typeof data.html === 'string' &&
          Buffer.byteLength(data.html) <= 20 * 1024 * 1024
        )
          bytes = Buffer.from(data.html)
        else throw new Error('Invalid export format.')
        return context.exportFile(
          bytes,
          `${document.name.replace(/\.[^.]+$/, '')}.${data.kind}`,
          data.kind,
        )
      },
    },
  }
}
