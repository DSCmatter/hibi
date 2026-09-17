import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'mdsvex',
  name: 'MDsveX',
  apiVersion: 1,
  kind: 'extension',
  description:
    'MDsveX source editing, preview, and export with an explicit native run action.',
  fileExtensions: ['svx'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
