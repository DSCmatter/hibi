import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, relative } from 'node:path'

const references = [
  [
    'docs/ai-agents/reference/markdown-syntax-api.md',
    'markdown syntax api',
    'src/shared/markdown-syntax.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/code-language-api.md',
    'code language api',
    'src/shared/syntax.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/toast-api.md',
    'sonner notification api',
    'src/ui/toasts.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/sideload-sdk.md',
    'sideload sdk',
    'src/addons/sdk.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/menu-api.md',
    'menu api',
    'src/ui/menus.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/toolbar-api.md',
    'toolbar api',
    'src/ui/toolbar.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/tooltip-api.md',
    'tooltip api',
    'src/ui/tooltips.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/colorscheme-api.md',
    'colorscheme api',
    'src/shared/colorschemes.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/dialog-api.md',
    'dialog api',
    'src/ui/dialogs.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/modal-api.md',
    'shared modal component',
    'src/ui/Modal.tsx',
    (source) => source,
    'tsx',
  ],
  [
    'docs/ai-agents/reference/controls-api.md',
    'shared controls',
    'src/ui/Controls.tsx',
    (source) => source,
    'tsx',
  ],
  [
    'docs/ai-agents/reference/settings-filter-api.md',
    'shared settings filter',
    'src/ui/SettingsFilter.tsx',
    (source) => source,
    'tsx',
  ],
  [
    'docs/ai-agents/reference/authors.md',
    'plugin authors',
    'src/addons/authors.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/theme-tokens.md',
    'theme tokens',
    'src/ui/tokens.css',
    (source) => source,
    'css',
  ],
  [
    'docs/ai-agents/reference/addon-api.md',
    'addon api',
    'src/addons/api.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/workspace-api.md',
    'workspace types',
    'src/shared/workspace.ts',
    (source) => source,
  ],
  [
    'docs/ai-agents/reference/sidebar-api.md',
    'shared sidebar api',
    'src/ui/Sidebar.tsx',
    (source) =>
      source.slice(
        source.indexOf('export type SidebarItem'),
        source.indexOf('function RenameInput'),
      ),
  ],
]
const summaries = {
  'markdown syntax api':
    'Define Markdown features that readers can turn on or off without losing the original text.',
  'code language api':
    'Add syntax highlighting for source files and code blocks.',
  'sonner notification api':
    'Show short notifications with shared placement, timing, and dismissal controls.',
  'sideload sdk':
    'Use these shared libraries when building a plugin that users install themselves.',
  'menu api': 'Open a menu with labeled actions and optional icons.',
  'toolbar api': 'Add toolbar actions and read the user’s toolbar preferences.',
  'tooltip api':
    'Show hints for controls without changing their accessible names.',
  'colorscheme api':
    'Define a color scheme and let users choose it for light or dark appearance.',
  'dialog api': 'Ask for input or confirmation in the app’s shared dialogs.',
  'shared modal component':
    'Use the shared modal for focus handling, dismissal, and keyboard access.',
  'shared controls':
    'Use these form controls and settings rows to match the rest of the app.',
  'shared settings filter': 'Add search and reset controls to a settings page.',
  'plugin authors':
    'These records identify people who contribute to Hibi plugins. Upstream credits belong in plugin readmes.',
  'theme tokens':
    'These CSS variables control shared colors, spacing, type, and motion.',
  'addon api':
    'Build plugins that add editor features, settings, commands, and document formats.',
  'workspace types':
    'Use these types to read workspace files, build indexes, and add file-list decorations.',
  'shared sidebar api':
    'Build sidebar lists and trees with the app’s shared navigation controls.',
}

async function generate() {
  let stale = false
  for (const [
    output,
    title,
    input,
    select,
    language = 'typescript',
  ] of references) {
    const source = select(await readFile(input, 'utf8')).trim()
    const heading =
      title.charAt(0).toUpperCase() +
      title.slice(1).replace(/\b(api|sdk)\b/g, (word) => word.toUpperCase())
    const link = relative(dirname(output), input).replaceAll('\\', '/')
    const expected = `# ${heading}\n\n${summaries[title]}\n\n[Source: \`${input}\`](${link})\n\n\`\`\`${language}\n${source}\n\`\`\`\n`
    if (process.argv.includes('--check')) {
      const current = await readFile(output, 'utf8').catch(() => '')
      if (current !== expected) {
        console.error(`outdated documentation: ${output}`)
        stale = true
      }
    } else {
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, expected)
    }
  }
  process.exitCode = stale ? 1 : 0
}

await generate()
if (process.argv.includes('--watch')) {
  let timer
  const watchers = [
    ...new Set(references.map(([, , input]) => dirname(input))),
  ].map((directory) =>
    watch(directory, (_event, filename) => {
      if (
        !references.some(
          ([, , input]) =>
            dirname(input) === directory && basename(input) === filename,
        )
      )
        return
      clearTimeout(timer)
      timer = setTimeout(() => {
        void generate().catch(console.error)
      }, 40)
    }),
  )
  const stop = () => {
    clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

import { watch } from 'node:fs'
