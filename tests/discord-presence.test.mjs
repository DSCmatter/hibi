import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setImmediate as tick } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { presenceAssets } from '../src/addons/discord-presence/assets.ts'
import {
  activityFor,
  DiscordPresence,
  discordSocketPaths,
  rpcFrame,
} from '../src/addons/discord-presence/rpc.ts'
import {
  DEFAULT_APPLICATION_ID,
  parsePreferences,
} from '../src/addons/discord-presence/types.ts'
import { fileAssociations } from '../src/shared/file-associations.ts'

const config = {
  applicationId: '123456789012345678',
  showDocumentName: false,
  showElapsed: true,
}
async function until(predicate) {
  const end = performance.now() + 4000
  while (!predicate()) {
    if (performance.now() > end)
      throw new Error('Discord fixture did not settle.')
    await tick()
  }
}
async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'hibi-discord-'))
  const path =
    process.platform === 'win32'
      ? `\\\\?\\pipe\\hibi-test-${process.pid}-${Date.now()}`
      : join(folder, 'rpc')
  const frames = [],
    peers = new Set()
  let connections = 0
  const server = createServer((socket) => {
    connections++
    peers.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => peers.delete(socket))
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (
        buffer.length >= 8 &&
        buffer.length >= 8 + buffer.readUInt32LE(4)
      ) {
        const opcode = buffer.readUInt32LE(0),
          length = buffer.readUInt32LE(4)
        const body = buffer.subarray(8, 8 + length)
        buffer = buffer.subarray(8 + length)
        if (opcode === 4) {
          frames.push({ opcode, body: body.toString() })
          continue
        }
        const value = JSON.parse(body.toString())
        frames.push({ opcode, value })
        if (opcode === 0) {
          const ready = rpcFrame(1, {
            cmd: 'DISPATCH',
            evt: 'READY',
            data: { user: { id: 'not-retained' } },
          })
          socket.write(ready.subarray(0, 5))
          setImmediate(() => {
            if (!socket.destroyed)
              socket.write(
                Buffer.concat([
                  ready.subarray(5),
                  rpcFrame(3, Buffer.from('ping')),
                ]),
              )
          })
        } else if (value.args?.activity) {
          socket.write(
            rpcFrame(1, { cmd: 'SET_ACTIVITY', nonce: value.nonce, data: {} }),
          )
        }
      }
    })
  })
  server.listen(path)
  await once(server, 'listening')
  t.after(async () => {
    for (const socket of peers) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
    await rm(folder, { recursive: true, force: true })
  })
  return { path, frames, peers, connections: () => connections }
}

test('Discord presence accepts only public application IDs and excludes names unless opted in', () => {
  assert.equal(DEFAULT_APPLICATION_ID, '1550610632137637958')
  assert.deepEqual(parsePreferences(config), config)
  for (const input of [
    null,
    {},
    { ...config, applicationId: 'token.secret' },
    { ...config, applicationId: 123 },
    { ...config, showDocumentName: 'true' },
  ])
    assert.throws(() => parsePreferences(input), /application ID/)
  assert.deepEqual(activityFor(config, '/private/workspace/secret.md', 100), {
    details: 'Writing in Hibi',
    assets: {
      large_image: 'https://hibi.garden/favicon.png',
      large_text: 'Hibi',
      small_image: 'https://hibi.garden/rpc/book-open-text.png',
      small_text: 'Markdown',
    },
    timestamps: { start: 100 },
  })
  assert.deepEqual(
    activityFor(
      { ...config, showDocumentName: true, showElapsed: false },
      'C:\\private\\notes\\name\n.md',
      100,
    ),
    {
      details: 'Writing in Hibi',
      state: 'Editing name.md',
      assets: {
        large_image: 'https://hibi.garden/favicon.png',
        large_text: 'Hibi',
        small_image: 'https://hibi.garden/rpc/book-open-text.png',
        small_text: 'Markdown',
      },
    },
  )
  assert.ok(
    Buffer.byteLength(
      activityFor({ ...config, showDocumentName: true }, '😀'.repeat(200), 100)
        .state,
    ) <= 128,
  )
  assert.equal(discordSocketPaths('win32', {})[0], '\\\\?\\pipe\\discord-ipc-0')
  const paths = discordSocketPaths('linux', {
    XDG_RUNTIME_DIR: '/run/user/1',
    TMPDIR: '/run/user/1',
    TMP: 'relative',
  })
  assert.equal(paths.length, 20)
  assert.equal(paths[0], '/run/user/1/discord-ipc-0')
  assert.equal(paths[10], '/tmp/discord-ipc-0')
})

test('file-type artwork covers bundled formats and aliases without exposing filenames or arbitrary URLs', () => {
  for (const format of Object.values(fileAssociations)) {
    for (const extension of format.ext) {
      const assets = presenceAssets(
        `C:\\private\\Secret.${extension.toUpperCase()}`,
      )
      assert.equal(assets.small_text, format.name)
      assert.equal(assets.large_image, 'https://hibi.garden/favicon.png')
      assert.equal(assets.large_text, 'Hibi')
      assert.match(
        assets.small_image,
        /^https:\/\/hibi\.garden\/rpc\/[a-z0-9-]+\.png$/,
      )
      assert.equal(JSON.stringify(assets).includes('Secret'), false)
    }
  }
  for (const [file, icon, label] of [
    ['note.tex', 'sigma', 'LaTeX'],
    ['note.typ', 'type', 'Typst'],
    ['note.mmd', 'chart-no-axes-combined', 'Mermaid'],
    ['note.html', 'code-xml', 'HTML'],
    ['note.org', 'list-tree', 'Org mode'],
    ['note.txt', 'file-text', 'Plain text'],
    ['note.Rmd', 'notebook-text', 'R Markdown'],
    ['note.qmd', 'notebook-text', 'Quarto'],
    ['note.jsonc', 'braces', 'JSON'],
    ['note.yaml', 'settings-2', 'Configuration'],
    ['note.csv', 'table', 'Table'],
    ['note.tsx', 'file-code-2', 'Source code'],
    ['note.ipynb', 'notebook-text', 'Jupyter Notebook'],
    ['https://untrusted.example/private.svg', 'image', 'Image'],
    ['private.unknown', 'file', 'Document'],
    ['__proto__', 'file', 'Document'],
    ['', 'file', 'Document'],
  ])
    assert.deepEqual(presenceAssets(file), {
      large_image: 'https://hibi.garden/favicon.png',
      large_text: 'Hibi',
      small_image: `https://hibi.garden/rpc/${icon}.png`,
      small_text: label,
    })
})

test('RPC coalesces file-type changes while names are hidden and keeps the elapsed session', async (t) => {
  const server = await fixture(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const presence = new DiscordPresence([server.path])
  t.after(() => presence.stop())
  presence.update(config, '/private/start.md')
  await until(() => presence.snapshot().state === 'connected')
  const activities = () =>
    server.frames
      .filter((frame) => frame.value?.args?.activity)
      .map((frame) => frame.value.args.activity)
  assert.equal(activities()[0].assets.small_text, 'Markdown')
  presence.update(config, '/private/intermediate.tex')
  presence.update(config, '/private/latest.typ')
  assert.equal(activities().length, 1)
  t.mock.timers.tick(15_000)
  await until(() => activities().length === 2)
  assert.equal(
    activities()[1].assets.small_image,
    'https://hibi.garden/rpc/type.png',
  )
  assert.equal(
    activities()[1].assets.large_image,
    'https://hibi.garden/favicon.png',
  )
  assert.equal(
    activities()[1].assets.large_image,
    activities()[0].assets.large_image,
  )
  assert.equal(activities()[1].state, undefined)
  assert.deepEqual(activities()[1].timestamps, activities()[0].timestamps)
  assert.doesNotMatch(
    JSON.stringify(activities()),
    /private|start\.md|intermediate|latest/,
  )
  presence.update(config, '/private/another.typ')
  t.mock.timers.tick(15_000)
  await tick()
  assert.equal(
    activities().length,
    2,
    'renaming within the same format does not publish a hidden filename',
  )
  assert.equal(
    server.connections(),
    1,
    'file-type artwork does not reconnect each refresh',
  )
})

test('local RPC handles fragmented frames, ping, rate limits, reconnects, privacy opt-out and cleanup', async (t) => {
  const server = await fixture(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const presence = new DiscordPresence([server.path])
  t.after(() => presence.stop())
  presence.update(config, 'secret.md')
  await until(() => presence.snapshot().state === 'connected')
  assert.deepEqual(server.frames[0], {
    opcode: 0,
    value: { v: 1, client_id: config.applicationId },
  })
  const activities = () =>
    server.frames.filter((frame) => frame.value?.cmd === 'SET_ACTIVITY')
  assert.equal(activities().length, 1)
  assert.equal(activities()[0].value.args.activity.state, undefined)
  await until(() => server.frames.some((frame) => frame.opcode === 4))
  assert.equal(server.frames.find((frame) => frame.opcode === 4).body, 'ping')
  presence.update({ ...config, showDocumentName: true }, 'first.md')
  presence.update({ ...config, showDocumentName: true }, 'latest.md')
  assert.equal(
    activities().length,
    1,
    'updates are coalesced during the rate limit',
  )
  t.mock.timers.tick(15_000)
  await until(() => activities().length === 2)
  assert.equal(activities()[1].value.args.activity.state, 'Editing latest.md')
  // Opting out clears the old activity even before the next allowed update.
  presence.update(config, 'never-share.md')
  await until(() => server.connections() === 2 && activities().length === 4)
  assert.equal(activities()[2].value.args.activity, null)
  assert.equal(activities()[3].value.args.activity.state, undefined)
  for (const peer of server.peers) peer.destroy()
  await until(() => presence.snapshot().state === 'waiting')
  t.mock.timers.tick(15_000)
  await until(() => presence.snapshot().state === 'connected')
  assert.equal(server.connections(), 3)
  presence.stop()
  await until(() => server.peers.size === 0)
  assert.equal(activities().at(-1).value.args.activity, null)
  t.mock.timers.tick(60_000)
  assert.equal(server.connections(), 3)
  assert.equal(presence.snapshot().state, 'stopped')
})

test('RPC rejects malformed frames, stops stale renderer leases, and never reconnects after stop', async (t) => {
  const server = await fixture(t)
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const presence = new DiscordPresence([server.path])
  t.after(() => presence.stop())
  presence.update(config, '')
  await until(() => presence.snapshot().state === 'connected')
  const oversized = Buffer.alloc(8)
  oversized.writeUInt32LE(1, 0)
  oversized.writeUInt32LE(65537, 4)
  server.peers.values().next().value.write(oversized)
  await until(() => presence.snapshot().state === 'error')
  assert.match(presence.snapshot().message, /oversized/)
  t.mock.timers.tick(15_000)
  await until(() => presence.snapshot().state === 'connected')
  t.mock.timers.tick(30_000)
  await until(
    () => presence.snapshot().state === 'stopped' && server.peers.size === 0,
  )
  assert.equal(
    server.frames.filter((frame) => frame.value?.cmd === 'SET_ACTIVITY').at(-1)
      .value.args.activity,
    null,
  )
  const count = server.connections()
  t.mock.timers.tick(60_000)
  assert.equal(server.connections(), count)
})

test('native presence validates config, reads metadata for file types without reading content, and clears on app lifecycle events', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hibi-discord-native-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const output = join(root, 'native.mjs')
  await build({
    stdin: {
      contents:
        "export { default } from './src/addons/discord-presence/native.ts';export { state, app } from 'electron'",
      resolveDir: process.cwd(),
    },
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'isolated-discord',
        setup(build) {
          build.onResolve({ filter: /^(electron|\.\/rpc)$/ }, ({ path }) => ({
            path,
            namespace: 'mock',
          }))
          build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
            contents:
              path === 'electron'
                ? `import {EventEmitter} from 'node:events';export const app=new EventEmitter();export const state={updates:[],stops:0,urls:[]};export const shell={openExternal:async url=>state.urls.push(url)};`
                : `import {state} from 'electron';export class DiscordPresence { update(config,name){state.updates.push({config,name});return this.snapshot()} stop(){state.stops++} snapshot(){return {state:'unconfigured',message:'fixture'}} }`,
          }))
        },
      },
    ],
  })
  const {
    default: addon,
    state,
    app,
  } = await import(pathToFileURL(output).href)
  let reads = 0
  const context = {
    document: {
      get() {
        reads++
        return {
          name: 'private.md',
          get markdown() {
            throw new Error('Document content must never be read')
          },
        }
      },
    },
  }
  await addon.methods.sync(config, context)
  assert.equal(reads, 1)
  assert.equal(state.updates[0].name, 'private.md')
  await addon.methods.sync({ ...config, showDocumentName: true }, context)
  assert.equal(reads, 2)
  assert.equal(state.updates[1].name, 'private.md')
  await assert.rejects(
    addon.methods.sync({ ...config, applicationId: 'not-a-token' }, context),
    /application ID/,
  )
  assert.equal(state.updates.length, 2)
  await addon.methods.sync({ ...config, applicationId: '' }, context)
  assert.equal(
    reads,
    2,
    'an unconfigured addon does not read document metadata',
  )
  assert.equal(state.updates[2].name, '')
  await addon.methods.setup('https://untrusted.example')
  assert.deepEqual(state.urls, ['https://discord.com/developers/applications'])
  addon.stop()
  app.emit('window-all-closed')
  app.emit('before-quit')
  assert.equal(state.stops, 3)
})
