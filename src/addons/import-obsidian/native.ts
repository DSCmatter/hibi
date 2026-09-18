import type { NativeAddon } from '../api'
import { importObsidian } from './convert'
export default {
  id: 'import-obsidian',
  methods: {},
  import: importObsidian,
} satisfies NativeAddon
