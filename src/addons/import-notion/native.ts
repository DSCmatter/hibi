import type { NativeAddon } from '../api'
import { importNotion } from './convert'
export default {
  id: 'import-notion',
  methods: {},
  import: importNotion,
} satisfies NativeAddon
