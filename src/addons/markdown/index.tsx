import { defineAddon } from '../api'
import manifest from './manifest'

export default defineAddon({
  manifest,
  start(context) {
    context.editor.registerCodeLanguage({
      id: 'markdown',
      aliases: manifest.fileExtensions,
      load: () =>
        import('@codemirror/lang-markdown').then(
          (module) => module.markdown().language,
        ),
    })
    context.editor.registerDocumentFormat({
      id: 'markdown',
      name: 'Markdown',
      extensions: manifest.fileExtensions,
      editing: 'markdown',
      views: ['normal', 'side-by-side', 'markdown'],
      formatting: 'markdown',
      codeLanguage: 'markdown',
      Preview: () => null,
    })
  },
})
