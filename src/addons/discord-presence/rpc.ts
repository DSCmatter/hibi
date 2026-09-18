import { randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { posix } from 'node:path'
import { presenceAssets } from './assets.ts'
import type { Preferences, PresenceStatus } from './types'

type Activity = {
  details: string
  assets: ReturnType<typeof presenceAssets>
  state?: string
  timestamps?: { start: number }
}
const UPDATE_INTERVAL = 15_000
const MAX_FRAME = 64 * 1024

export function discordSocketPaths(
  platform = process.platform,
  env = process.env,
) {
  const slots = Array.from({ length: 10 }, (_, index) => `discord-ipc-${index}`)
  if (platform === 'win32') return slots.map((slot) => `\\\\?\\pipe\\${slot}`)
  return [
    ...new Set([env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp']),
  ]
    .filter((path): path is string => !!path && posix.isAbsolute(path))
    .flatMap((path) => slots.map((slot) => posix.join(path, slot)))
}

export function activityFor(
  preferences: Preferences,
  name: string,
  started: number,
): Activity {
  let title = 'Editing '
  for (const character of name.split(/[\\/]/).at(-1) ?? '') {
    if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      continue
    if (Buffer.byteLength(title + character) > 128) break
    title += character
  }
  return {
    details: 'Writing in Hibi',
    assets: presenceAssets(name),
    ...(preferences.showDocumentName && title !== 'Editing '
      ? { state: title }
      : {}),
    ...(preferences.showElapsed ? { timestamps: { start: started } } : {}),
  }
}

export function rpcFrame(opcode: number, payload: unknown) {
  const data = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(JSON.stringify(payload))
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data])
}

/** Local IPC only. The renderer cannot supply socket paths or arbitrary RPC commands. */
export class DiscordPresence {
  private socket: Socket | null = null
  private ready = false
  private clientId = ''
  private activity: Activity | null = null
  private started = 0
  private index = 0
  private buffer: Buffer = Buffer.alloc(0)
  private retry: ReturnType<typeof setTimeout> | undefined
  private deadline: ReturnType<typeof setTimeout> | undefined
  private scheduled: ReturnType<typeof setTimeout> | undefined
  private lease: ReturnType<typeof setTimeout> | undefined
  private pending: string | null = null
  private lastPayload = ''
  private lastSent = 0
  private status: PresenceStatus = {
    state: 'unconfigured',
    message: 'Add a Discord application ID to connect.',
  }

  private readonly paths: string[]
  constructor(paths = discordSocketPaths()) {
    this.paths = paths
  }
  snapshot(): PresenceStatus {
    return { ...this.status }
  }

  update(preferences: Preferences, name: string) {
    if (!preferences.applicationId) {
      this.stop()
      this.status = {
        state: 'unconfigured',
        message: 'Add a Discord application ID to connect.',
      }
      return this.snapshot()
    }
    if (this.clientId !== preferences.applicationId) {
      this.stop()
      this.clientId = preferences.applicationId
      this.started = Math.floor(Date.now() / 1000)
    }
    // Clear an opted-out filename immediately, including while rate-limited.
    if (!preferences.showDocumentName && this.activity?.state)
      this.disconnect(true)
    this.activity = activityFor(preferences, name, this.started)
    clearTimeout(this.lease)
    this.lease = setTimeout(() => this.stop(), 45_000).unref()
    if (!this.socket && !this.retry) this.connect()
    else this.publish()
    return this.snapshot()
  }

  stop() {
    this.clientId = ''
    this.activity = null
    clearTimeout(this.lease)
    clearTimeout(this.retry)
    this.retry = undefined
    this.index = 0
    this.disconnect(true)
    this.status = { state: 'stopped', message: 'Discord presence is stopped.' }
  }

  private disconnect(clear: boolean) {
    clearTimeout(this.deadline)
    clearTimeout(this.scheduled)
    this.scheduled = undefined
    const socket = this.socket
    this.socket = null
    if (socket) {
      if (clear && this.ready && socket.writable) {
        socket.end(
          rpcFrame(1, {
            cmd: 'SET_ACTIVITY',
            args: { pid: process.pid, activity: null },
            nonce: randomUUID(),
          }),
        )
        setTimeout(() => socket.destroy(), 250).unref()
      } else socket.destroy()
    }
    this.ready = false
    this.buffer = Buffer.alloc(0)
    this.pending = null
    this.lastPayload = ''
    this.lastSent = 0
  }

  private connect() {
    if (!this.clientId || this.socket) return
    const path = this.paths[this.index++]
    if (!path) {
      this.index = 0
      this.status = {
        state: 'waiting',
        message: 'Open the Discord desktop app. Hibi will retry automatically.',
      }
      this.retryLater()
      return
    }
    this.status = { state: 'connecting', message: 'Connecting to Discord…' }
    const socket = createConnection(path)
    this.socket = socket
    const failed = () => {
      if (this.socket !== socket) return
      const wasReady = this.ready
      this.disconnect(false)
      if (wasReady) {
        this.status = {
          state: 'waiting',
          message: 'Discord disconnected. Hibi will reconnect automatically.',
        }
        this.index = 0
        this.retryLater()
      } else this.connect()
    }
    this.deadline = setTimeout(failed, 2000).unref()
    socket.on('error', failed)
    socket.on('close', failed)
    socket.on('connect', () => {
      if (this.socket === socket)
        socket.write(rpcFrame(0, { v: 1, client_id: this.clientId }))
    })
    socket.on('data', (data: Buffer) => {
      if (this.socket !== socket) return
      try {
        if (this.buffer.length + data.length > 2 * MAX_FRAME)
          throw new Error('Discord sent an oversized RPC frame.')
        this.buffer = Buffer.concat([this.buffer, data])
        while (this.buffer.length >= 8 && this.socket === socket) {
          const opcode = this.buffer.readUInt32LE(0),
            length = this.buffer.readUInt32LE(4)
          if (length > MAX_FRAME)
            throw new Error('Discord sent an oversized RPC frame.')
          if (this.buffer.length < length + 8) break
          const body = this.buffer.subarray(8, length + 8)
          this.buffer = this.buffer.subarray(length + 8)
          if (opcode === 3) socket.write(rpcFrame(4, body))
          else if (opcode === 2)
            throw new Error(
              'Discord closed the connection. Check the application ID and desktop client.',
            )
          else if (opcode === 1) this.receive(JSON.parse(body.toString('utf8')))
          else if (opcode !== 4)
            throw new Error('Discord sent an unsupported RPC message.')
        }
      } catch (error) {
        this.fail(
          error instanceof Error ? error.message : 'Invalid Discord response.',
        )
      }
    })
  }

  private retryLater() {
    if (!this.clientId || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = undefined
      this.connect()
    }, UPDATE_INTERVAL).unref()
  }
  private fail(message: string) {
    this.disconnect(true)
    this.status = { state: 'error', message: message.slice(0, 240) }
    this.index = 0
    this.retryLater()
  }
  private receive(value: {
    evt?: string
    cmd?: string
    nonce?: string
    data?: { message?: string }
  }) {
    if (value?.evt === 'ERROR')
      throw new Error(
        typeof value.data?.message === 'string'
          ? `Discord: ${value.data.message}`
          : 'Discord rejected the activity. Check the application ID.',
      )
    if (!this.ready && value?.evt === 'READY' && value.cmd === 'DISPATCH') {
      clearTimeout(this.deadline)
      this.ready = true
      this.index = 0
      this.publish()
    } else if (
      this.pending &&
      value?.nonce === this.pending &&
      value.cmd === 'SET_ACTIVITY'
    ) {
      clearTimeout(this.deadline)
      this.pending = null
      this.status = {
        state: 'connected',
        message: 'Your Hibi activity is connected to Discord.',
      }
      this.publish()
    }
  }
  private publish() {
    if (!this.ready || !this.socket || !this.activity || this.pending) return
    const payload = JSON.stringify(this.activity)
    if (payload === this.lastPayload) return
    const wait = this.lastSent + UPDATE_INTERVAL - Date.now()
    if (wait > 0) {
      this.scheduled ??= setTimeout(() => {
        this.scheduled = undefined
        this.publish()
      }, wait).unref()
      return
    }
    clearTimeout(this.scheduled)
    this.scheduled = undefined
    this.lastPayload = payload
    this.lastSent = Date.now()
    this.pending = randomUUID()
    this.socket.write(
      rpcFrame(1, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: this.activity },
        nonce: this.pending,
      }),
    )
    this.deadline = setTimeout(
      () => this.fail('Discord did not confirm the activity. Hibi will retry.'),
      5000,
    ).unref()
  }
}
