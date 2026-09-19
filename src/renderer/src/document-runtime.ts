import { type DocumentState, MAX_DOCUMENT_BYTES } from '../../shared/desktop.ts'
import { sourceChange } from '../../shared/document-journal.ts'
import { DocumentSession } from '../../shared/document-session.ts'
import type { SourceSnapshot } from '../../shared/source-buffer.ts'
import type {
  RawEdit,
  SourceOperation,
} from '../../shared/source-operations.ts'

type RuntimeOptions = {
  enqueue: (operation: SourceOperation) => void
  onError: (error: unknown) => void
}
type Listener = (
  document: DocumentState,
  changes: readonly RawEdit[] | null,
) => void

/** Per-tab source/history ownership. React and legacy addons receive immutable read facades. */
export class DocumentRuntime {
  readonly #sessions = new Map<string, DocumentSession>()
  readonly #sources = new WeakMap<DocumentState, SourceSnapshot>()
  readonly #listeners = new Set<Listener>()
  readonly #options: RuntimeOptions
  #active: DocumentSession | null = null
  #metadata: Omit<DocumentState, 'markdown' | 'savedMarkdown'> | null = null
  #cached: DocumentState | null = null
  #cachedState: ReturnType<DocumentSession['state']> | null = null
  #savedText: { snapshot: SourceSnapshot; value?: string } | null = null
  #changes: readonly RawEdit[] | null = null
  #detach: (() => void)[] = []
  #updating = false

  constructor(options: RuntimeOptions) {
    this.#options = options
  }
  session = () => this.#active
  sourceFor = (document: DocumentState) => this.#sources.get(document)
  subscribe = (listener: Listener) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
  get = (): DocumentState | null => {
    const session = this.#active,
      metadata = this.#metadata
    if (!session || !metadata) return null
    const state = session.state()
    if (this.#cached && this.#cachedState === state) return this.#cached
    const snapshot = session.snapshot(),
      saved = session.savedSnapshot()
    if (this.#savedText?.snapshot !== saved)
      this.#savedText = { snapshot: saved }
    const savedText = this.#savedText
    let text: string | undefined
    this.#cached = Object.freeze({
      ...metadata,
      revision: snapshot.document.revision,
      contentVersion: snapshot.version,
      dirty: state.dirty || metadata.ephemeral,
      get markdown() {
        text ??= snapshot.materialize()
        return text
      },
      get savedMarkdown() {
        savedText.value ??= saved.materialize()
        return savedText.value
      },
    })
    this.#cachedState = state
    this.#sources.set(this.#cached, snapshot)
    return this.#cached
  }
  #publish = () => {
    if (this.#updating) return
    const document = this.get(),
      changes = this.#changes
    this.#changes = null
    if (document)
      for (const listener of [...this.#listeners]) listener(document, changes)
  }
  activate(document: DocumentState) {
    this.#updating = true
    try {
      for (const detach of this.#detach) detach()
      this.#detach = []
      const { markdown, savedMarkdown, ...metadata } = document
      let session = this.#sessions.get(document.tabId)
      if (
        session &&
        (session.snapshot().version !== document.contentVersion ||
          session.snapshot().materialize() !== markdown)
      ) {
        session.dispose()
        session = undefined
      }
      if (!session) {
        session = new DocumentSession(
          markdown,
          document,
          document.contentVersion,
          {
            ...this.#options,
            maximumBytes: MAX_DOCUMENT_BYTES,
          },
        )
        this.#sessions.set(document.tabId, session)
      } else session.reidentify(document)
      session.importSaved(savedMarkdown)
      this.#active = session
      this.#metadata = metadata
      this.#cached = null
      this.#changes = null
      this.#detach = [
        session.subscribeOperations((prepared) => {
          this.#changes = prepared.operation.changes
        }),
        session.subscribe(this.#publish),
      ]
      const open = new Set([
        document.tabId,
        ...document.tabs.map((tab) => tab.id),
      ])
      for (const [id, retained] of this.#sessions)
        if (!open.has(id)) {
          retained.dispose()
          this.#sessions.delete(id)
        }
    } finally {
      this.#updating = false
    }
    return this.get()!
  }
  acknowledgeSave(document: DocumentState) {
    const current = this.get(),
      session = this.#active
    if (
      !current ||
      !session ||
      current.tabId !== document.tabId ||
      current.revision !== document.revision
    )
      return
    this.#updating = true
    try {
      session.importSaved(document.savedMarkdown)
      this.#cached = null
    } finally {
      this.#updating = false
    }
    this.#publish()
  }
  #replacement(source: string) {
    const session = this.#active
    if (!session) return null
    const snapshot = session.snapshot(),
      change = sourceChange(this.get()!.markdown, source)
    if (!change) return null
    // Whole-source compatibility can change CRLF spelling. Own complete pairs.
    let { from, to, insert } = change
    if (!snapshot.isEditBoundary(from)) {
      from--
      insert = snapshot.sliceRaw(from, from + 1) + insert
    }
    if (!snapshot.isEditBoundary(to)) {
      insert += snapshot.sliceRaw(to, to + 1)
      to++
    }
    return { session, changes: [{ from, to, insert }] }
  }
  /** Explicit whole-source compatibility transform. Incremental surfaces use session.edit. */
  replace(
    source: string,
    origin: SourceOperation['origin'] = 'addon',
    group: string = crypto.randomUUID(),
  ) {
    const edit = this.#replacement(source)
    return edit?.session.edit(edit.changes, origin, group) ?? null
  }
  beginReplace(source: string, group: string) {
    const edit = this.#replacement(source)
    return edit?.session.beginEdit(edit.changes, 'visual', group) ?? null
  }
  dispose() {
    for (const detach of this.#detach) detach()
    for (const session of this.#sessions.values()) session.dispose()
    this.#sessions.clear()
    this.#listeners.clear()
    this.#active = null
    this.#metadata = null
    this.#cached = null
    this.#savedText = null
  }
}

const errors = new Set<(error: unknown) => void>()
const reportError = (error: unknown) => {
  for (const listener of errors) listener(error)
}
export const documentRuntime = new DocumentRuntime({
  enqueue: (operation) => {
    void window.hibi.appendSourceOperation(operation).catch(reportError)
  },
  onError: reportError,
})
export const observeDocumentErrors = (listener: (error: unknown) => void) => {
  errors.add(listener)
  return () => {
    errors.delete(listener)
  }
}
