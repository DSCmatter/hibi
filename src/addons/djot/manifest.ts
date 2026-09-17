import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'djot',
  name: 'Djot',
  apiVersion: 1,
  kind: 'extension',
  description: 'Djot source editing, preview, and export.',
  fileExtensions: ['dj'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
