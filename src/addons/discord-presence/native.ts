import { app, shell } from 'electron'
import type { NativeAddon } from '../api'
import { DiscordPresence } from './rpc'
import { parsePreferences } from './types'

const presence = new DiscordPresence()
app.on('before-quit', () => presence.stop())
app.on('window-all-closed', () => presence.stop())

export default {
  id: 'discord-presence',
  stop: () => presence.stop(),
  queries: {
    async status() {
      return presence.snapshot()
    },
  },
  methods: {
    async sync(input, context) {
      const preferences = parsePreferences(input)
      return presence.update(
        preferences,
        preferences.showDocumentName ? context.document.get().name : '',
      )
    },
    async disconnect() {
      presence.stop()
    },
    async setup() {
      await shell.openExternal('https://discord.com/developers/applications')
    },
  },
} satisfies NativeAddon
