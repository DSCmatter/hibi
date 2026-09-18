import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// CodeMirror Vim 6.4 ignores user mapping prefixes when a built-in key matches
// immediately (for example, <Space>w versus <Space>). Keep the engine's own
// mapping and macro machinery, but give user prefixes priority over defaults.
let path
try {
  path = fileURLToPath(import.meta.resolve('@replit/codemirror-vim-core'))
} catch (error) {
  // Packaged apps already contain the patched renderer and omit dev dependencies.
  if (
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    process.env.NODE_ENV === 'production'
  )
    process.exit(0)
  throw error
}
const source = await readFile(path, 'utf8')
const before = `for (var i = startIndex; i < keyMap.length; i++) {
      var command = keyMap[i];`
const after = `for (var i = startIndex; i < keyMap.length; i++) {
      // User mapping prefixes must wait for their next key before built-in actions run.
      if (i == keyMap.length - defaultKeymapLength && partial.length) return { partial: partial, full: [] };
      var command = keyMap[i];`

if (!source.includes(after)) {
  if (!source.includes(before))
    throw new Error(
      'The Vim engine changed. Review the mapping-prefix patch before updating it.',
    )
  await writeFile(path, source.replace(before, after))
}
