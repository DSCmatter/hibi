import { resolve } from 'node:path'

/** OS launch arguments are paths, never commands or URLs. */
export function externalFileArguments(
  argv: readonly string[],
  cwd: string,
  development: boolean,
): string[] {
  const paths: string[] = []
  let positional = false
  const args = argv.slice(development ? 2 : 1)
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!positional && arg === '--') {
      positional = true
      continue
    }
    if (!positional && arg.startsWith('-')) {
      if (!arg.includes('=') && arg !== '--hibi-test') index += 1
      continue
    }
    if (arg && !arg.includes('\0') && !/^[a-z][a-z\d+.-]*:\/\//i.test(arg))
      paths.push(resolve(cwd, arg))
  }
  return [...new Set(paths)]
}
