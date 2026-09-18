import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { NativeAddon } from '../api'
import manifest from './manifest'

export default {
  id: manifest.id,
  methods: {
    async export(input, context) {
      const snapshot = await context.workspace.snapshot()
      if (input !== undefined) {
        if (!input || typeof input !== 'object')
          throw new Error('Could not prepare the documentation export.')
        const { pages, css } = input as Record<string, unknown>
        if (
          !Array.isArray(pages) ||
          pages.length !== snapshot.pages.length ||
          typeof css !== 'string' ||
          Buffer.byteLength(css) > 2 * 1024 * 1024
        )
          throw new Error('Could not prepare the documentation export.')
        let bytes = 0
        for (const page of snapshot.pages) {
          const rendered = pages.find((entry) => entry?.path === page.path)
          if (
            !rendered ||
            rendered.markdown !== page.markdown ||
            typeof rendered.html !== 'string'
          )
            throw new Error(
              'The workspace changed during export. Export again.',
            )
          bytes += Buffer.byteLength(rendered.html)
          if (bytes > 40 * 1024 * 1024)
            throw new Error(
              'The documentation export exceeds the 40 MiB limit.',
            )
          page.html = rendered.html
        }
        snapshot.css = css
      }
      const template = await readFile(
        join(app.getAppPath(), 'out/site/template.html'),
        'utf8',
      )
      const data = JSON.stringify(snapshot)
        .replaceAll('<', '\\u003c')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029')
      const html = template.replace('__HIBI_WORKSPACE_DATA__', () => data)
      return context.exportHtml(
        html,
        `${snapshot.name}.html`,
        snapshot.pages.length,
      )
    },
  },
} satisfies NativeAddon
