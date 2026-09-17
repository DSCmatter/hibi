import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'mdx',
  name: 'MDX',
  apiVersion: 1,
  kind: 'extension',
  description:
    'MDX source editing, preview, and export with an explicit native run action.',
  fileExtensions: ['mdx'],
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
