import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import type { Plugin } from 'vite'

/** Bundle analysis separately so its imports never become main-renderer dependencies. */
export function analysisBundles(): Plugin {
  const moduleId = 'virtual:hibi-analysis'
  return {
    name: 'analysis-bundles',
    resolveId(id) {
      if (id === moduleId) return `\0${moduleId}`
    },
    async load(id) {
      if (id !== `\0${moduleId}`) return
      const bundles: Record<string, string> = {}
      for (const directory of ['src/addons', 'src/useraddons']) {
        for (const entry of await readdir(directory, {
          withFileTypes: true,
        }).catch(() => [])) {
          if (!entry.isDirectory()) continue
          const files = await readdir(`${directory}/${entry.name}`)
          if (!files.includes('analysis.ts')) continue
          const result = await build({
            entryPoints: [`${directory}/${entry.name}/analysis.ts`],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            write: false,
            metafile: true,
            minify: true,
            target: 'chrome152',
          })
          for (const file of Object.keys(result.metafile.inputs))
            this.addWatchFile(resolve(file))
          bundles[entry.name] = result.outputFiles[0]!.text
        }
      }
      return `export default ${JSON.stringify(bundles)}`
    },
  }
}
export function analysisPreload(): Plugin {
  return {
    name: 'analysis-preload',
    async generateBundle() {
      const result = await build({
        entryPoints: ['src/preload/analysis.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        external: ['electron'],
        write: false,
        metafile: true,
        target: 'node24',
      })
      for (const file of Object.keys(result.metafile.inputs))
        this.addWatchFile(resolve(file))
      this.emitFile({
        type: 'asset',
        fileName: 'analysis.cjs',
        source: result.outputFiles[0]!.text,
      })
    },
  }
}
