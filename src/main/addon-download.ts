import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { crc32 } from 'node:zlib'
import {
  addonPackageUrl,
  MAX_ADDON_BYTES,
  MAX_ADDON_ENTRIES,
  MAX_ADDON_FILE_BYTES,
  validAddonPath,
} from '../shared/addon-package.ts'
import { openBoundedZip } from './zip-reader.ts'

/** No cookies, credentials, or code execution; redirects must remain HTTPS. */
export async function downloadAddon(
  value: unknown,
): Promise<{ zip: Buffer; host: string }> {
  let url = addonPackageUrl(value)
  const signal = AbortSignal.timeout(20000)
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: { Accept: 'application/zip' },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || redirects === 5)
        throw new Error(
          'The addon download redirects too many times. Use a direct download URL.',
        )
      url = addonPackageUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(
        `Could not download the addon (${response.status}). Check the URL and try again.`,
      )
    }
    if (Number(response.headers.get('content-length')) > MAX_ADDON_BYTES) {
      await response.body.cancel()
      throw new Error('The addon download exceeds the 25 MiB limit.')
    }
    const parts: Uint8Array[] = []
    let bytes = 0
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > MAX_ADDON_BYTES)
          throw new Error('The addon download exceeds the 25 MiB limit.')
        parts.push(value)
      }
    } finally {
      await reader.cancel()
    }
    return { zip: Buffer.concat(parts), host: url.host }
  }
  throw new Error('Could not download the addon. Check the URL and try again.')
}

/** Extract only bounded regular files into an owned, empty staging directory. */
export async function unpackAddon(
  zip: Buffer,
  destination: string,
): Promise<string> {
  if (zip.length > MAX_ADDON_BYTES || zip.length < 22)
    throw new Error('This is not a valid addon ZIP file.')
  const directory = await openBoundedZip(zip, MAX_ADDON_ENTRIES)
  const manifests = directory.files.filter((file) =>
    /^(?:[^/]+\/)?hibi-addon\.json$/.test(file.path),
  )
  if (manifests.length !== 1)
    throw new Error(
      'The ZIP file needs one hibi-addon.json at its root or inside a single addon folder.',
    )
  const prefix = manifests[0]!.path.slice(0, -'hibi-addon.json'.length)
  let total = 0
  const seen = new Set<string>()
  for (const file of directory.files) {
    const path = file.path.replace(/\/$/, '')
    const mode = (file.externalFileAttributes >>> 16) & 0xf000
    if (
      file.flags & 1 ||
      ![0, 0x8000, 0x4000].includes(mode) ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    )
      throw new Error(
        'Addon ZIP files cannot contain symbolic links, special files, encrypted files, or unsafe paths.',
      )
    if (
      path.startsWith('__MACOSX/') ||
      path === '__MACOSX' ||
      path.split('/').some((part) => part.startsWith('.'))
    )
      continue
    if (!validAddonPath(path))
      throw new Error('The addon ZIP file contains an invalid path.')
    if (prefix && file.path === prefix && file.type === 'Directory') continue
    if (!file.path.startsWith(prefix))
      throw new Error('The ZIP file must contain a single addon folder.')
    const relative = path.slice(prefix.length)
    if (!validAddonPath(relative) || seen.has(relative.toLowerCase()))
      throw new Error(
        'The addon ZIP file contains an invalid or duplicate path.',
      )
    seen.add(relative.toLowerCase())
    if (file.type === 'Directory') {
      await mkdir(join(destination, relative), { recursive: true, mode: 0o700 })
      continue
    }
    if (file.uncompressedSize > MAX_ADDON_FILE_BYTES)
      throw new Error('Each addon file must be no larger than 5 MiB.')
    const parts: Buffer[] = []
    let size = 0
    const stream = file.stream()
    try {
      for await (const chunk of stream) {
        const part = Buffer.from(chunk)
        size += part.length
        total += part.length
        if (size > MAX_ADDON_FILE_BYTES || total > MAX_ADDON_BYTES)
          throw new Error(
            'The addon exceeds the limit of 5 MiB per file or 25 MiB in total.',
          )
        parts.push(part)
      }
    } finally {
      stream.destroy()
    }
    const content = Buffer.concat(parts)
    if (size !== file.uncompressedSize || crc32(content) !== file.crc32)
      throw new Error('The addon ZIP file is damaged. Download it again.')
    const target = join(destination, relative)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await writeFile(target, content, { flag: 'wx', mode: 0o600 })
  }
  return destination
}
