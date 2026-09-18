import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Marked } from 'marked'

const files = ['README.md', 'AGENTS.md']
for (const root of ['docs', 'src/addons', 'locales'])
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile() && /\.md$/i.test(entry.name))
      files.push(join(entry.parentPath, entry.name))

const parser = new Marked()
let broken = 0
for (const file of files) {
  const links = []
  parser.walkTokens(parser.lexer(await readFile(file, 'utf8')), (token) => {
    if (token.type === 'link' || token.type === 'image') links.push(token.href)
  })
  for (const href of links) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue
    const path = decodeURIComponent(href.split(/[?#]/)[0])
    if (!path) continue
    const target = resolve(dirname(file), path)
    if (!(await stat(target).catch(() => null))) {
      console.error(`${file}: missing link ${href}`)
      broken++
    }
  }
}
if (!broken)
  console.log(`Checked local links in ${files.length} Markdown files.`)
process.exitCode = broken ? 1 : 0
