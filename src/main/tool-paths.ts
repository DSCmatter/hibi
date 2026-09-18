import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join, relative, sep } from 'node:path'

export function toolSearchPath() {
  return [
    ...new Set([
      ...(process.env.PATH ?? '').split(delimiter),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/opt/miniconda3/bin',
      '/Library/TeX/texbin',
      ...(process.platform === 'win32'
        ? [
            join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps'),
            join(process.env.LOCALAPPDATA ?? '', 'Pandoc'),
            join(process.env.ProgramFiles ?? '', 'Pandoc'),
            join(process.env.ProgramFiles ?? '', 'Git', 'cmd'),
            join(process.env.ProgramFiles ?? '', 'Quarto', 'bin'),
          ]
        : []),
    ]),
  ].filter(isAbsolute)
}

export async function executableFile(path: string, excluded?: string | null) {
  const resolved = await realpath(path).catch(() => null)
  if (!resolved) return null
  if (excluded) {
    const root = await realpath(excluded).catch(() => excluded)
    const child = relative(root, resolved)
    if (
      !child ||
      (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
    )
      return null
  }
  try {
    if (!(await stat(resolved)).isFile()) return null
    await access(resolved, constants.X_OK)
    return resolved
  } catch {
    return null
  }
}

export async function findTool(command: string, excluded?: string | null) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(command) || command.includes('..'))
    throw new Error('Invalid executable name.')
  for (const directory of toolSearchPath()) {
    const names =
      process.platform === 'win32'
        ? /\.exe$/i.test(command)
          ? [command]
          : [`${command}.exe`, ...(command === 'quarto' ? ['quarto.cmd'] : [])]
        : [command]
    for (const name of names) {
      const path = await executableFile(join(directory, name), excluded)
      if (path) return path
    }
  }
  return null
}
