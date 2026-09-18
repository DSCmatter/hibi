import notice from '../../../docs/licenses/typst-assets.md?raw'
import { fileAssociations } from '../../shared/file-associations'
import type { AddonManifest } from '../api'
import { authors } from '../authors'

export default {
  id: 'typst',
  name: 'Typst',
  kind: 'extension',
  version: '1.0.0',
  apiVersion: 2,
  description:
    'Typst documents, live previews, PDF export, and rendered Markdown blocks.',
  defaultEnabled: false,
  fileExtensions: fileAssociations.typst.ext,
  authors: [authors.may],
  licenses: [
    {
      id: 'typst-assets',
      name: 'Typst bundled fonts and assets',
      license: 'see notices',
      text: notice,
    },
  ],
} satisfies AddonManifest
