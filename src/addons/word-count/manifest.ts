import type { AddonManifest } from '../api'
import { authors } from '../authors'

export default {
  id: 'word-count',
  name: 'Word count',
  version: '1.0.0',
  apiVersion: 2,
  description: 'Live word and character totals for the current document.',
  defaultEnabled: false,
  startup: 'background',
  authors: [authors.may],
} satisfies AddonManifest
