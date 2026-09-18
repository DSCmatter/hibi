import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { importBear } from '../src/addons/import-bear/convert.ts'
import { importNotion } from '../src/addons/import-notion/convert.ts'
import { importObsidian } from '../src/addons/import-obsidian/convert.ts'
import {
  readImportFolder,
  readImportZip,
  validateImportFiles,
} from '../src/main/import-files.ts'
import {
  validateManifest,
  workspaceIgnore,
} from '../src/main/workspace-metadata.ts'
import { zipFiles } from './zip.mjs'

const file = (path, source) => ({ path, data: Buffer.from(source) })
const text = (file) => new TextDecoder().decode(file.data)
test('imports reject unsafe paths, collisions, archives, and oversized entries', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-import-input-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const path of [
    '../escape.md',
    '/root.md',
    'C:/escape.md',
    'a\\b.md',
    '.hibi.json',
    'a/../b.md',
    'NUL.md',
  ])
    assert.throws(() => validateImportFiles([file(path, '')]))
  assert.throws(
    () => validateImportFiles([file('A.md', ''), file('a.md', '')]),
    /duplicate/,
  )
  assert.throws(
    () => validateImportFiles([file('a', ''), file('a/b.md', '')]),
    /file and folder/,
  )
  const zip = join(root, 'export.zip')
  for (const entry of [
    { name: '../outside.md', content: 'no' },
    { name: 'link', content: '../outside', mode: 0xa000 },
    { name: 'large.md', declaredSize: 40 * 1024 * 1024 },
    { name: 'bad.md', content: 'text', crc: 123 },
    { name: 'encrypted.md', flags: 1 },
  ]) {
    await writeFile(zip, zipFiles([entry]))
    await assert.rejects(readImportZip(zip))
  }
  await writeFile(
    zip,
    zipFiles([
      { name: 'notes/a.md', content: '# Note', deflate: true },
      { name: '.obsidian/settings.json', content: '{}' },
    ]),
  )
  const result = await readImportZip(zip)
  assert.deepEqual(
    result.files.map((file) => file.path),
    ['notes/a.md'],
  )
  assert.equal(text(result.files[0]), '# Note')
  const folder = join(root, 'folder')
  await mkdir(folder)
  await writeFile(join(folder, 'note.md'), '# Note')
  await symlink(zip, join(folder, 'link.zip'))
  assert.deepEqual(
    (await readImportFolder(folder)).files.map((file) => file.path),
    ['note.md'],
  )
})
test('import converters preserve assets and code while translating links and CSV', async () => {
  const definitions = await importObsidian([
    file(
      'note.md',
      '[site]: https://example.com\n\n[site]\n\n``code ` [[Other]]``\n',
    ),
    file('Other.md', ''),
  ])
  assert.match(text(definitions.files[0]), /\[site\]: https:\/\/example.com/)
  assert.match(text(definitions.files[0]), /``code ` \[\[Other\]\]``/)
  const obsidian = await importObsidian([
    file(
      'notes/Start.md',
      '[[Other|Read this]]\n![[image.png]]\n`[[Other]]`\n\n```js\n[[Other]]\n```\n',
    ),
    file('Other.md', '# Other'),
    file('image.png', 'image'),
  ])
  const note = text(obsidian.files[0])
  assert.deepEqual(obsidian.warnings, [])
  assert.match(note, /\[Read this\]\(\.\.\/Other.md\)/)
  assert.match(note, /!\[image.png\]\(\.\.\/image.png\)/)
  assert.match(note, /`\[\[Other\]\]`/)
  assert.match(note, /```js\n\[\[Other\]\]\n```/)
  const notion = await importNotion([
    file('Page.md', '[Tasks](Tasks%20abc.csv)'),
    file('Tasks abc.csv', 'Name,Description\r\n"A, B","two\nlines"\r\n'),
  ])
  assert.equal(text(notion.files[0]), '[Tasks](Tasks%20abc.csv.md)')
  assert.match(
    text(notion.files.find((file) => file.path === 'Tasks abc.csv.md')),
    /A, B \| two<br>lines/,
  )
  const bear = await importBear([
    file('Note.textbundle/text.md', '![Image](assets/a.png)'),
    file('Note.textbundle/assets/a.png', 'image'),
    file('Note.textbundle/info.json', '{}'),
  ])
  assert.equal(text(bear.files[0]), '![Image](assets/a.png)')
  assert.ok(
    bear.files.some((file) => file.path === 'Note.textbundle/assets/a.png'),
  )
})
test('workspace metadata validates relative documents and honors gitignore patterns', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-ignore-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const manifest = {
    version: 1,
    name: 'My notes',
    icon: 'book-open',
    description: '',
    defaultFile: 'notes/Start.md',
  }
  assert.deepEqual(validateManifest(manifest), manifest)
  for (const defaultFile of ['/etc/passwd', '../note.md', 'a\\b.md'])
    assert.throws(() => validateManifest({ ...manifest, defaultFile }))
  await writeFile(join(root, '.hibiignore'), '*.tmp\n!keep.tmp\ndrafts/\n')
  const rules = await workspaceIgnore(root)
  assert.equal(rules.ignores('drafts/note.md'), true)
  assert.equal(rules.ignores('a.tmp'), true)
  assert.equal(rules.ignores('keep.tmp'), false)
})
