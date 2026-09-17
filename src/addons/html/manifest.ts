import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'html',
  name: 'HTML',
  apiVersion: 1,
  kind: 'extension',
  description: 'HTML source editing, preview, and export.',
  fileExtensions: ['html', 'htm'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
