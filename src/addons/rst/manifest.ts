import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'rst',
  name: 'reStructuredText',
  apiVersion: 1,
  kind: 'extension',
  description: 'reStructuredText source editing, preview, and export.',
  fileExtensions: ['rst'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
