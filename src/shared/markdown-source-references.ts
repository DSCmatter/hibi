import { Marked } from 'marked'
import { alertMarkdown } from '../addons/github-markdown/alerts.ts'
import { textExtrasMarkdown } from '../addons/text-extras/syntax.ts'
import type { MarkdownReferenceSyntax } from './document-worker-protocol.ts'
import type { SourceSnapshot } from './source-buffer.ts'
import type { SourceOwners } from './source-owners.ts'
import { type ReferenceRegion, SourceReferences } from './source-references.ts'

/** Built-in Markdown definition semantics, loaded only on reference demand. */
export class MarkdownSourceReferences {
  readonly #parser: Marked
  #index: SourceReferences | null = null
  #owners: SourceOwners | null = null
  constructor(syntax: MarkdownReferenceSyntax) {
    this.#parser = new Marked({ gfm: syntax.gfm, breaks: false })
    if (syntax.alerts) this.#parser.use(alertMarkdown)
    if (syntax.textExtras) this.#parser.use(textExtrasMarkdown)
  }
  update(source: SourceSnapshot, owners: SourceOwners) {
    if (owners === this.#owners) return
    const read = (region: ReferenceRegion) =>
      region.owner.kind === 'Frontmatter'
        ? {}
        : this.#parser.lexer(source.sliceRaw(region.from, region.to)).links
    if (this.#index) this.#index.update(owners, read)
    else this.#index = new SourceReferences(owners, read)
    this.#owners = owners
  }
  lookup(label: string) {
    return this.#index?.scope().links[label] ?? null
  }
  counters(reset = false) {
    return this.#index?.counters(reset)
  }
  dispose() {
    this.#index?.dispose()
    this.#index = null
    this.#owners = null
  }
}
