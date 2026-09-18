import { fileAssociations } from '../../shared/file-associations'
import type { AddonManifest } from '../api'
import { authors } from '../authors'
export default {
  id: 'quarto',
  name: 'Quarto Markdown',
  apiVersion: 2,
  version: '1.0.0',
  kind: 'extension',
  description:
    'Quarto Markdown source editing, preview, and export with an explicit native run action.',
  fileExtensions: fileAssociations.quarto.ext,
  defaultEnabled: false,
  authors: [authors.may],
} satisfies AddonManifest
