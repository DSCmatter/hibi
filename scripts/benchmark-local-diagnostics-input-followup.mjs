import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'

// Keep the existing input harness and endpoint; change only samples per session.
const manifestPath = process.argv[2]
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const root = dirname(manifestPath)
const source = await readFile('scripts/benchmark-input.mjs', 'utf8')
assert.equal(source.split('key < 20').length, 2)
await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir')
const driver = join(root, 'input-120.mjs')
await build({
  stdin: {
    contents: source.replace('key < 20', 'key < 120'),
    resolveDir: resolve('scripts'),
    sourcefile: 'benchmark-input.mjs',
  },
  outfile: driver,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
})
for (const profile of ['release', 'off', 'debug']) {
  const variant = manifest.variants.find((v) => v.profile === profile)
  const stream = createWriteStream(join(variant.directory, 'input-120.json'))
  const child = spawn(process.execPath, [driver], {
    cwd: variant.directory,
    env: { ...process.env, HIBI_INPUT_RUNS: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(stream, { end: false })
  child.stderr.pipe(stream, { end: false })
  const code = await new Promise((done, reject) => {
    child.once('error', reject)
    child.once('exit', done)
  })
  await new Promise((done) => stream.end(done))
  assert.equal(code, 0)
}
console.log(root)
