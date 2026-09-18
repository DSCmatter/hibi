import { createHash } from 'node:crypto'
import { lstat, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import ignore from 'ignore'
import type { WorkspaceManifest } from '../shared/workspace-settings'

export const WORKSPACE_MANIFEST = '.hibi.json'
export const WORKSPACE_IGNORE = '.hibiignore'
export async function readWorkspaceText(root: string, name: string) {
  const path = join(root, name)
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
      throw new Error(
        `Cannot read ${name}. Use a text file smaller than 64 KiB.`,
      )
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}
export function validateManifest(input: unknown): WorkspaceManifest {
  const value = input as WorkspaceManifest | null
  if (
    !value ||
    value.version !== 1 ||
    !['name', 'description', 'icon', 'defaultFile'].every(
      (key) => typeof value[key as keyof WorkspaceManifest] === 'string',
    )
  )
    throw new Error('The workspace manifest is invalid.')
  if (
    !value.name.trim() ||
    value.name.length > 120 ||
    value.description.length > 2000 ||
    !/^[a-zA-Z0-9._:-]{0,100}$/.test(value.icon) ||
    value.defaultFile.length > 1024 ||
    Array.from(value.name + value.defaultFile).some(
      (character) => character.charCodeAt(0) < 32,
    ) ||
    value.defaultFile.includes('\\') ||
    isAbsolute(value.defaultFile) ||
    (value.defaultFile &&
      value.defaultFile
        .split('/')
        .some((part) => !part || part === '.' || part === '..'))
  )
    throw new Error('Check the workspace name, icon, and default file path.')
  return {
    version: 1,
    name: value.name.trim(),
    description: value.description,
    icon: value.icon,
    defaultFile: value.defaultFile,
  }
}
export async function workspaceMetadata(root: string) {
  const [source, rules] = await Promise.all([
    readWorkspaceText(root, WORKSPACE_MANIFEST),
    readWorkspaceText(root, WORKSPACE_IGNORE),
  ])
  return {
    manifest: source ? validateManifest(JSON.parse(source)) : null,
    manifestRevision: createHash('sha256')
      .update(source)
      .update('\0')
      .update(rules)
      .digest('hex'),
    ignore: rules,
  }
}
export async function workspaceIgnore(root: string) {
  return ignore().add(await readWorkspaceText(root, WORKSPACE_IGNORE))
}
export async function writeWorkspaceText(
  root: string,
  name: string,
  content: string,
) {
  // Metadata is never written through symlinks, including abandoned temporary files.
  const temporary = join(root, `.${name}.${crypto.randomUUID()}.tmp`)
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
  try {
    await rename(temporary, join(root, name))
  } catch (error) {
    await import('node:fs/promises').then((fs) =>
      fs.rm(temporary, { force: true }),
    )
    throw error
  }
}
