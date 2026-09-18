import css from '../_shared/format-style.css?inline'
import { formatToolbar } from '../_shared/format-toolbar'
import { localPreview } from '../_shared/local-preview'
import { defineAddon } from '../api'
import { bbcodeLanguage } from './language'
import manifest from './manifest'
import { renderBBCode } from './render'

export default defineAddon({
  manifest,
  start(context) {
    const styles = `${css}\n.bbcode-content{white-space:pre-wrap}.bbcode-content pre{white-space:pre-wrap;padding:12px;background:var(--surface-raised,#eee);border-radius:6px}`
    context.styles.register('preview', styles)
    context.editor.registerCodeLanguage({
      id: 'bbcode',
      aliases: manifest.fileExtensions,
      language: bbcodeLanguage,
    })
    context.editor.registerDocumentSyntax({
      id: 'preview',
      label: 'BBCode preview',
      group: 'BBCode',
      level: 'block',
    })
    const render = async (source: string) => ({
      html: renderBBCode(source),
      css: styles,
    })
    const formatting = formatToolbar('bbcode')
    if (formatting !== 'markdown')
      formatting.actions = formatting.actions.filter(
        (action) => !['divider', 'table'].includes(action),
      )
    context.editor.registerDocumentFormat({
      id: 'bbcode',
      name: 'BBCode',
      extensions: manifest.fileExtensions,
      language: bbcodeLanguage,
      codeLanguage: 'bbcode',
      views: ['side-by-side', 'markdown'],
      formatting,
      Preview: localPreview(context, render),
      render,
    })
    context.commands.register({
      id: 'new',
      label: 'New BBCode document',
      run: async () => {
        if (await context.native.invoke('create'))
          context.app.runAction('side-by-side')
      },
    })
  },
})
