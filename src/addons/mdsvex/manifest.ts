import { fileAssociations } from '../../shared/file-associations'
import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'mdsvex',
  name: 'MDsveX',
  apiVersion: 2,
  version: '1.0.0',
  kind: 'extension',
  description:
    'MDsveX source editing, preview, and export with an explicit native run action.',
  fileExtensions: fileAssociations.mdsvex.ext,
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
