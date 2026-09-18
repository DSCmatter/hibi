import { fileAssociations } from '../../shared/file-associations'
import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'mediawiki',
  name: 'MediaWiki',
  apiVersion: 2,
  version: '1.0.0',
  kind: 'extension',
  description: 'MediaWiki source editing, preview, and export.',
  fileExtensions: fileAssociations.mediawiki.ext,
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
