import type { ThemePreferences } from '../../shared/colorschemes'
import { defineAddon, type ExportResult } from '../api'
import manifest from './manifest'

export default defineAddon({
  manifest,
  start(context) {
    context.commands.register({
      id: 'export',
      label: 'Export workspace to HTML',
      async run() {
        const workspace =
          (await context.workspace.get()) ?? (await context.workspace.open())
        if (!workspace) return
        const [{ ExportDialog, savedExportOptions }, defaults] =
          await Promise.all([
            import('./ExportDialog'),
            context.native.query<{ theme: ThemePreferences; graph: boolean }>(
              'options',
            ),
          ])
        const key = `hibi:export:${workspace.id ?? workspace.name}`
        const initial = savedExportOptions(key, workspace.name, defaults.theme)
        const formId = `export-${crypto.randomUUID()}`
        const dialog = context.dialogs.open({
          title: 'Export workspace',
          size: 'wide',
          closeOnOutsideClick: false,
          content: ({ close }) => (
            <ExportDialog
              formId={formId}
              context={context}
              initial={initial}
              graph={defaults.graph}
              save={async (options, password) => {
                const snapshot = await context.workspace.snapshot()
                const styles = new Set<string>()
                const pages = []
                for (const page of snapshot.pages) {
                  const rendered = await context.editor.renderDocument(
                    page.markdown,
                    page.path,
                    page.id,
                  )
                  if (rendered.css) styles.add(rendered.css)
                  pages.push({
                    path: page.path,
                    markdown: page.markdown,
                    html: rendered.html,
                  })
                }
                const result = await context.native.invoke<ExportResult | null>(
                  'export',
                  { pages, css: [...styles].join('\n'), options, password },
                )
                if (!result) return false
                try {
                  localStorage.setItem(key, JSON.stringify(options))
                } catch {
                  /* Export still succeeds when preference storage is full. */
                }
                close()
                context.notify(
                  `Exported ${result.pages} ${result.pages === 1 ? 'page' : 'pages'} to ${result.path}`,
                )
                return true
              }}
            />
          ),
          footer: () => <div id={`${formId}-footer`} />,
        })
        await dialog.result
      },
    })
  },
})
