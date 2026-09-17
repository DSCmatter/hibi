import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'textile',
  name: 'Textile',
  apiVersion: 1,
  kind: 'extension',
  description: 'Textile source editing, preview, and export.',
  fileExtensions: ['textile'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
