import { documentExtension } from '../../shared/document-types.ts'
import { fileAssociations } from '../../shared/file-associations.ts'

const formatIcons = {
  text: 'file-text',
  markdown: 'book-open-text',
  mdx: 'file-code-2',
  math: 'sigma',
  rst: 'book-open',
  asciidoc: 'book-open',
  org: 'list-tree',
  typst: 'type',
  html: 'code-xml',
  mediawiki: 'book-open',
  rmarkdown: 'notebook-text',
  quarto: 'notebook-text',
  mdsvex: 'file-code-2',
  markdoc: 'braces',
  djot: 'file-type-2',
  textile: 'file-type-2',
  creole: 'file-type-2',
  mermaid: 'chart-no-axes-combined',
  bbcode: 'braces',
} satisfies Record<keyof typeof fileAssociations, string>

const otherTypes = [
  { ext: ['json', 'jsonc', 'json5'], icon: 'braces', name: 'JSON' },
  { ext: ['csv', 'tsv'], icon: 'table', name: 'Table' },
  { ext: ['xml', 'xsl', 'xslt'], icon: 'code-xml', name: 'XML' },
  { ext: ['ipynb'], icon: 'notebook-text', name: 'Jupyter Notebook' },
  {
    ext: ['yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'],
    icon: 'settings-2',
    name: 'Configuration',
  },
  {
    ext: [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'avif',
      'svg',
      'bmp',
      'ico',
      'tif',
      'tiff',
    ],
    icon: 'image',
    name: 'Image',
  },
  {
    ext: [
      'js',
      'jsx',
      'mjs',
      'cjs',
      'ts',
      'tsx',
      'css',
      'scss',
      'sass',
      'less',
      'py',
      'rb',
      'go',
      'rs',
      'c',
      'h',
      'cpp',
      'hpp',
      'java',
      'kt',
      'swift',
      'lua',
      'php',
      'sql',
      'sh',
      'bash',
      'zsh',
      'fish',
    ],
    icon: 'file-code-2',
    name: 'Source code',
  },
]

/** Only fixed public artwork URLs and labels leave this lookup, never file paths. */
export function presenceAssets(name: string) {
  const extension = documentExtension(name.split(/[\\/]/).at(-1) ?? '')
  let icon = 'file',
    label = 'Document'
  const format = Object.entries(fileAssociations).find(([, format]) =>
    format.ext.includes(extension),
  )
  if (format) {
    icon = formatIcons[format[0] as keyof typeof formatIcons]
    label = format[1].name
  } else {
    const other = otherTypes.find((type) => type.ext.includes(extension))
    if (other) {
      icon = other.icon
      label = other.name
    }
  }
  return {
    large_image: 'https://hibi.garden/favicon.png',
    large_text: 'Hibi',
    small_image: `https://hibi.garden/rpc/${icon}.png`,
    small_text: label,
  }
}
