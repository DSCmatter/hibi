import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'tags',
  name: 'Tags',
  kind: 'extension',
  version: '1.0.0',
  apiVersion: 2,
  description: 'Inline #tags and a searchable workspace tag browser.',
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
