import type { AddonDependency } from '../api'

export const pandocDependency = {
  id: 'pandoc',
  name: 'Pandoc',
  command: 'pandoc',
  homepage: 'https://pandoc.org/installing.html',
  reason:
    'Convert document source for previews and HTML exports. Requires Pandoc 3.11 or newer.',
  install: { brew: { package: 'pandoc' }, winget: 'JohnMacFarlane.Pandoc' },
} satisfies AddonDependency
export const tectonicDependency = {
  id: 'tectonic',
  name: 'Tectonic',
  command: 'tectonic',
  homepage: 'https://tectonic-typesetting.github.io/book/latest/installation/',
  reason:
    'Compile LaTeX documents to PDF. Inline Markdown equations use the bundled renderer.',
  optional: true,
  install: { brew: { package: 'tectonic' } },
} satisfies AddonDependency
export const quartoDependency = {
  id: 'quarto',
  name: 'Quarto',
  command: 'quarto',
  homepage: 'https://quarto.org/docs/get-started/',
  reason: 'Run Quarto documents with embedded code when you choose Run.',
  optional: true,
  install: { brew: { package: 'quarto', cask: true } },
} satisfies AddonDependency
export const rDependency = {
  id: 'rscript',
  name: 'R',
  command: 'Rscript',
  homepage: 'https://cran.r-project.org/',
  reason:
    'Run R Markdown documents. Install the rmarkdown package separately in R.',
  optional: true,
  install: { brew: { package: 'r' } },
} satisfies AddonDependency
export const gitDependency = {
  id: 'git',
  name: 'Git',
  command: 'git',
  homepage: 'https://git-scm.com/downloads',
  reason:
    'Read repository state, review changes, commit, and synchronize notes.',
  install: { brew: { package: 'git' }, winget: 'Git.Git' },
} satisfies AddonDependency
