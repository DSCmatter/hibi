import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'mediawiki',
  name: 'MediaWiki',
  apiVersion: 1,
  kind: 'extension',
  description: 'MediaWiki source editing, preview, and export.',
  fileExtensions: ['wiki', 'mediawiki'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
