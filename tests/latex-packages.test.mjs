import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  bundlePackages,
  downloadedPackages,
  latexPackages,
  packageName,
} from '../src/addons/math/packages.ts'

test('LaTeX package names cannot inject source, flags, or paths', () => {
  for (const name of ['xcolor', 'amsmath', 'l3kernel', 'utf8-2018'])
    assert.equal(packageName(name), name)
  for (const name of [
    '',
    '../xcolor',
    '-xcolor',
    'x}\\input{secret}',
    'a,b',
    'a\nb',
    null,
  ])
    assert.throws(() => packageName(name))
  assert.deepEqual(
    bundlePackages(
      'xcolor.sty\r\namsmath.sty\nxcolor.sty\n../bad.sty\nfoo.tex\n',
    ),
    ['amsmath', 'xcolor'],
  )
})

test('package downloads compile with shell execution disabled and report existing cache files', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'hibi-packages-'))
  t.after(() => rm(scratch, { recursive: true, force: true }))
  const cache = join(scratch, 'cache')
  await mkdir(join(cache, 'manifests'), { recursive: true })
  const hash = 'a'.repeat(64)
  await mkdir(join(cache, 'files', 'aa'), { recursive: true })
  await writeFile(join(cache, 'files', 'aa', hash.slice(2)), 'package')
  await writeFile(
    join(cache, 'manifests', `${hash}.txt`),
    `xcolor.sty 7 ${hash}\nmissing.sty 7 ${'b'.repeat(64)}\n../escape.sty 7 ${hash}\n`,
  )
  const calls = []
  const result = await latexPackages(
    { name: 'xcolor' },
    scratch,
    cache,
    async (args) => {
      calls.push(args)
      return args.includes('search') ? 'xcolor.sty\namsmath.sty\n' : ''
    },
  )
  assert.deepEqual(calls[0], [
    '-X',
    'compile',
    '--untrusted',
    '--outdir',
    scratch,
    join(scratch, 'package.tex'),
  ])
  assert.match(
    await readFile(join(scratch, 'package.tex'), 'utf8'),
    /\\usepackage\{xcolor\}/,
  )
  assert.deepEqual(result, {
    names: ['amsmath', 'xcolor'],
    downloaded: ['xcolor'],
  })
  await rm(join(cache, 'files', 'aa', hash.slice(2)))
  assert.deepEqual(await downloadedPackages(cache), [])
})
