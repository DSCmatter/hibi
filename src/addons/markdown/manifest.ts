import type { AddonManifest } from '../api'
import { authors } from '../authors'

export default {
  id: 'markdown',
  name: 'Markdown',
  apiVersion: 1,
  kind: 'extension',
  description:
    'Markdown documents with rich editing, source view, and HTML export.',
  defaultEnabled: true,
  fileExtensions: ['md', 'markdown'],
  authors: [authors.may],
} satisfies AddonManifest
