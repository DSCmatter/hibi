import type { NativeAddon } from '../api'

export function localFormatNative(
  id: string,
  name: string,
  source: string,
): NativeAddon {
  return {
    id,
    methods: {
      create: (_input, context) => context.document.create(name, source),
      async export(input, context) {
        const value = input as {
          html?: unknown
          css?: unknown
          name?: unknown
        } | null
        if (
          !value ||
          typeof value.html !== 'string' ||
          typeof value.css !== 'string' ||
          typeof value.name !== 'string' ||
          value.html.length + value.css.length > 20 * 1024 * 1024
        )
          throw new Error('Could not export this document.')
        // No scripts or network access in standalone format exports.
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'"><title>Document</title><style>body{max-width:900px;margin:40px auto;padding:24px;font:16px/1.6 system-ui}img{max-width:100%}${value.css.replaceAll('</', '<\\/')}</style></head><body>${value.html}</body></html>`
        return context.exportFile(
          new TextEncoder().encode(html),
          `${value.name.replace(/\.[^.]+$/, '')}.html`,
          'html',
        )
      },
    },
  }
}
