import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LatexPackages } from '../_shared/format-specs'

export type LatexPackageTask = { name?: string }

export function packageName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(value)
  )
    throw new Error('Enter a valid LaTeX package name.')
  return value
}

export function bundlePackages(output: string): string[] {
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}\.sty$/.test(name))
        .map((name) => name.slice(0, -4)),
    ),
  ].sort()
}

export async function downloadedPackages(cache: string): Promise<string[]> {
  const directory = join(cache, 'manifests')
  const manifests = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return []
    },
  )
  const names = new Set<string>()
  for (const manifest of manifests) {
    if (!/^[a-f0-9]{64}\.txt$/.test(manifest)) continue
    const file = join(directory, manifest)
    const info = await lstat(file)
    if (!info.isFile() || info.size > 8 * 1024 * 1024) continue
    // Tectonic's cache manifest maps filenames to content hashes.
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const match =
        /^([a-zA-Z0-9][a-zA-Z0-9_.-]{0,100})\.sty \d+ ([a-f0-9]{64})$/.exec(
          line,
        )
      const name = match?.[1],
        hash = match?.[2]
      if (!name || !hash) continue
      const blob = await lstat(
        join(cache, 'files', hash.slice(0, 2), hash.slice(2)),
      ).catch(() => null)
      if (blob?.isFile()) names.add(name)
    }
  }
  return [...names].sort()
}

export async function latexPackages(
  task: LatexPackageTask,
  scratch: string,
  cache: string,
  run: (args: string[]) => Promise<string>,
): Promise<LatexPackages> {
  if (task.name !== undefined) {
    const name = packageName(task.name)
    const entry = join(scratch, 'package.tex')
    await writeFile(
      entry,
      `\\documentclass{article}\n\\usepackage{${name}}\n\\begin{document}\\null\\end{document}\n`,
    )
    await run(['-X', 'compile', '--untrusted', '--outdir', scratch, entry])
  }
  const names = bundlePackages(await run(['-X', 'bundle', 'search', '.sty']))
  return { names, downloaded: await downloadedPackages(cache) }
}
