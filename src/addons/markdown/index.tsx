import { markdown } from '@codemirror/lang-markdown'
import { defineAddon } from '../api'
import manifest from './manifest'

export default defineAddon({
  manifest,
  start(context) {
    const language = markdown().language
    context.editor.registerCodeLanguage({
      id: 'markdown',
      aliases: manifest.fileExtensions,
      language,
    })
    context.editor.registerDocumentFormat({
      id: 'markdown',
      name: 'Markdown',
      extensions: manifest.fileExtensions,
      editing: 'markdown',
      language,
      codeLanguage: 'markdown',
      Preview: () => null,
    })
  },
})
