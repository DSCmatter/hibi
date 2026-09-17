import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'org',
  name: 'Org mode',
  apiVersion: 1,
  kind: 'extension',
  description: 'Org mode source editing, preview, and export.',
  fileExtensions: ['org'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
