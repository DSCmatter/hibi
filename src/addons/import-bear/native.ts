import type { NativeAddon } from '../api'
import { importBear } from './convert'
export default {
  id: 'import-bear',
  methods: {},
  import: importBear,
} satisfies NativeAddon
