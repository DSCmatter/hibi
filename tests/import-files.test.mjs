import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
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
  WORKSPACE_IGNORE,
  WORKSPACE_MANIFEST,
  workspaceIgnore,
  workspaceMetadata,
  writeWorkspaceText,
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
    '.hibi/workspace.json',
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

test('workspace settings move into .hibi on save and preserve legacy files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal((await workspaceMetadata(root)).manifest, null)
  assert.deepEqual(await readdir(root), [])
  const original = JSON.stringify({
    version: 1,
    name: 'Old name',
    description: '',
    icon: 'folder',
    defaultFile: '',
  })
  await writeFile(join(root, '.hibi.json'), original)
  await writeFile(join(root, '.hibiignore'), 'drafts/\n')
  const legacy = await workspaceMetadata(root)
  assert.equal(legacy.manifest.name, 'Old name')
  assert.equal((await workspaceIgnore(root)).ignores('drafts/note.md'), true)
  await writeWorkspaceText(
    root,
    WORKSPACE_MANIFEST,
    JSON.stringify({ ...legacy.manifest, name: 'New name' }),
  )
  await writeWorkspaceText(root, WORKSPACE_IGNORE, '')
  const current = await workspaceMetadata(root)
  assert.equal(current.manifest.name, 'New name')
  assert.notEqual(current.manifestRevision, legacy.manifestRevision)
  assert.equal((await workspaceIgnore(root)).ignores('drafts/note.md'), false)
  assert.equal(await readFile(join(root, '.hibi.json'), 'utf8'), original)
  assert.equal(await readFile(join(root, '.hibiignore'), 'utf8'), 'drafts/\n')
  assert.deepEqual((await readdir(join(root, '.hibi'))).sort(), [
    'ignore',
    'workspace.json',
  ])
  await assert.rejects(
    writeWorkspaceText(root, WORKSPACE_MANIFEST, original, true),
    { code: 'EEXIST' },
  )
  assert.equal((await workspaceMetadata(root)).manifest.name, 'New name')
})

test('workspace metadata rejects linked folders and files without writing through them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-metadata-links-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const outside = join(root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'ignore'), 'keep')
  await symlink(outside, join(root, '.hibi'), 'dir')
  await assert.rejects(workspaceMetadata(root), /regular folder/)
  await assert.rejects(
    writeWorkspaceText(root, WORKSPACE_IGNORE, 'changed'),
    /regular folder/,
  )
  assert.equal(await readFile(join(outside, 'ignore'), 'utf8'), 'keep')
  await rm(join(root, '.hibi'))
  await mkdir(join(root, '.hibi'))
  await symlink(join(outside, 'ignore'), join(root, WORKSPACE_IGNORE))
  await assert.rejects(workspaceMetadata(root), /Cannot read/)
  await writeWorkspaceText(root, WORKSPACE_IGNORE, 'notes/')
  assert.equal(await readFile(join(outside, 'ignore'), 'utf8'), 'keep')
  assert.equal((await workspaceIgnore(root)).ignores('notes/a.md'), true)
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
