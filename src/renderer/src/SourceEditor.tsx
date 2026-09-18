import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
  selectAll,
} from '@codemirror/commands'
import { markdown as markdownLanguage } from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  type Language,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language'
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  SearchQuery,
  search,
  setSearchQuery,
} from '@codemirror/search'
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
} from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { marked } from 'marked'
import { useEffect, useRef, useState } from 'react'
import type { DocumentFormat, SourceExtension } from '../../addons/api'
import { type DocumentState, MAX_DOCUMENT_BYTES } from '../../shared/desktop'
import { editedSource, sourceEditMatches } from '../../shared/document-edits'
import { DocumentNotice } from '../../ui/DocumentNotice'
import { codeHighlighter, codeLanguages } from './code-languages'
import { documentEdits } from './document-edits'
import { editorDocument } from './document-formats'
import { documentProjections } from './document-projections'
import type { FindMove, FindStatus } from './FindBar'
import {
  observeSourceAnnotations,
  sourceAnnotationExtension,
} from './source-annotations'
import {
  formattingKeymap,
  type SourceFormatting,
  sourceFormatting,
} from './source-formatting'
import { normalizeSource, sourceText } from './source-text'
import { registerSourceView } from './source-view'
import { textProjection } from './text-projection'

const externalChange = Annotation.define<boolean>()
const highlighting = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--syntax-heading)', fontWeight: '600' },
  { tag: tags.strong, color: 'var(--syntax-strong)', fontWeight: '600' },
  { tag: tags.emphasis, color: 'var(--syntax-emphasis)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--syntax-link)' },
  { tag: tags.monospace, color: 'var(--syntax-code)' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--syntax-meta)' },
  { tag: tags.quote, color: 'var(--syntax-quote)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
])

export function SourceEditor({
  document,
  editTarget,
  markdownMode,
  sourceLanguage,
  codeLanguage,
  sourceFormat,
  supportsMedia,
  label,
  active,
  onReady,
  value,
  onChange,
  disabled,
  externalRevision,
  findActive,
  findQuery,
  findMove,
  onFindStatus,
  showLineNumbers,
  sourceExtensions,
  onFormatting,
  onLink,
}: {
  document: DocumentState
  editTarget: boolean
  markdownMode: boolean
  sourceLanguage: Language | undefined
  codeLanguage?: string | undefined
  sourceFormat?: DocumentFormat['formatting']
  supportsMedia: boolean
  label: string
  active: boolean
  onReady: (status: 'loading' | 'ready' | 'failed') => void
  value: string
  onChange: (value: string) => void
  disabled: boolean
  externalRevision: number
  findActive: boolean
  findQuery: string
  findMove: FindMove
  onFindStatus: (status: FindStatus) => void
  showLineNumbers: boolean
  sourceExtensions: readonly SourceExtension[]
  onFormatting: (formatting: SourceFormatting | null) => void
  onLink: (href: string) => void
}) {
  const parserOptions = useRef({
    markdownMode,
    sourceLanguage,
    codeLanguage,
    label,
    sourceFormat,
    supportsMedia,
  })
  parserOptions.current = {
    markdownMode,
    sourceLanguage,
    codeLanguage,
    label,
    sourceFormat,
    supportsMedia,
  }
  const configureParser = useRef(() => {})
  // biome-ignore lint/correctness/useExhaustiveDependencies: parser configuration reads these current values through parserOptions.
  useEffect(() => {
    configureParser.current()
  }, [
    markdownMode,
    sourceLanguage,
    codeLanguage,
    label,
    sourceFormat,
    supportsMedia,
  ])
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const [installedExtensions, setInstalledExtensions] = useState<
    readonly SourceExtension[] | null
  >(null)
  const [measured, setMeasured] = useState(false)
  const [extensionError, setExtensionError] = useState('')
  const [languageError, setLanguageError] = useState('')
  const [languageReady, setLanguageReady] = useState(!codeLanguage)
  const inputReady = installedExtensions === sourceExtensions && languageReady
  const editContext = useRef({ document, editTarget, disabled, inputReady })
  editContext.current = { document, editTarget, disabled, inputReady }
  const change = useRef(onChange)
  const initialValue = useRef(value)
  const sourceBuffer = useRef<ReturnType<typeof sourceText> | null>(null)
  if (!sourceBuffer.current) sourceBuffer.current = sourceText(value)
  const exactChange = useRef<string | null>(null)
  const sourceHistory = useRef(new Map<string, string>())
  const rememberSource = (source: string) => {
    const next = sourceText(source, sourceBuffer.current?.lineBreak)
    if (next.nativeLineBreaks || exactChange.current !== null) {
      sourceHistory.current.set(next.text, source)
      let size = [...sourceHistory.current].reduce(
        (size, [text, raw]) => size + text.length + raw.length,
        0,
      )
      while (sourceHistory.current.size > 32 || size > 8 * 1024 * 1024) {
        const oldest = sourceHistory.current.keys().next().value!
        size -= oldest.length + sourceHistory.current.get(oldest)!.length
        sourceHistory.current.delete(oldest)
      }
    }
    sourceBuffer.current = next
  }
  const remember = useRef(rememberSource)
  remember.current = rememberSource
  const appliedRevision = useRef(externalRevision)
  const editable = useRef(new Compartment())
  const numbers = useRef(new Compartment())
  const addons = useRef(new Compartment())
  const find = useRef({ active: findActive, report: onFindStatus })
  const handledFindMove = useRef(findMove.id)
  const ready = useRef(onReady)
  const formatting = useRef<SourceFormatting | null>(null)
  const reportFormatting = useRef(onFormatting)
  const openLink = useRef(onLink)
  openLink.current = onLink
  reportFormatting.current = onFormatting
  ready.current = onReady
  find.current = { active: findActive, report: onFindStatus }
  change.current = onChange

  useEffect(() => {
    if (!host.current) return
    const language = new Compartment()
    const markdown = () => {
      const { markdownMode, sourceLanguage, codeLanguage, label } =
        parserOptions.current
      return [
        markdownMode
          ? codeLanguage && !codeLanguages.resolve(codeLanguage)
            ? []
            : markdownLanguage({ codeLanguages: codeLanguages.resolve })
          : codeLanguage
            ? (codeLanguages.resolve(codeLanguage) ?? [])
            : (sourceLanguage ?? []),
        keymap.of(
          formattingKeymap((id) => formatting.current?.run(id) ?? false),
        ),
        EditorView.contentAttributes.of({
          'aria-label': markdownMode ? 'Markdown editor' : `${label} editor`,
        }),
      ]
    }
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: normalizeSource(initialValue.current),
        extensions: [
          addons.current.of([]),
          search({
            createPanel: () => {
              const dom = window.document.createElement('div')
              dom.hidden = true
              return { dom }
            },
          }),
          editable.current.of([
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
          ]),
          numbers.current.of([]),
          language.of(markdown()),
          history(),
          sourceAnnotationExtension,
          EditorView.domEventHandlers({
            blur(_event, view) {
              const selection = view.state.selection
              if (selection.ranges.some((range) => range.empty && range.assoc))
                view.dispatch({
                  // Clear wrapped-line affinity so background measurements cannot
                  // restore the native selection and steal focus from the rich pane.
                  selection: EditorSelection.create(
                    selection.ranges.map((range) =>
                      range.empty ? EditorSelection.cursor(range.head) : range,
                    ),
                    selection.mainIndex,
                  ),
                })
            },
            click(event, view) {
              if (!event.shiftKey || !parserOptions.current.markdownMode)
                return false
              const position = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              })
              if (position == null) return false
              let node = syntaxTree(view.state).resolveInner(position, -1)
              while (node.parent && !['Link', 'Autolink'].includes(node.name))
                node = node.parent
              if (!['Link', 'Autolink'].includes(node.name)) return false
              let href = ''
              marked.walkTokens(
                marked.lexer(view.state.sliceDoc(node.from, node.to)),
                (token) => {
                  if (token.type === 'link') href = token.href
                },
              )
              if (!href) return false
              event.preventDefault()
              openLink.current(href)
              return true
            },
          }),
          keymap.of([
            { key: 'Ctrl-a', run: selectAll },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          syntaxHighlighting(highlighting),
          syntaxHighlighting(codeHighlighter),
          EditorView.lineWrapping,
          placeholder('Start typing'),
          EditorView.contentAttributes.of({
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet || update.focusChanged)
              update.view.contentDOM.dispatchEvent(
                new Event('hibi:source-caret', { bubbles: true }),
              )
            if (
              update.docChanged ||
              update.selectionSet ||
              update.transactions.some(
                (transaction) => transaction.effects.length,
              )
            )
              reportFormatting.current(formatting.current)
            if (find.current.active) {
              const query = getSearchQuery(update.state)
              let total = 0
              let current = 0
              if (query.valid) {
                const cursor = query.getCursor(update.state)
                for (
                  let match = cursor.next();
                  !match.done;
                  match = cursor.next()
                ) {
                  total += 1
                  if (
                    match.value.from === update.state.selection.main.from &&
                    match.value.to === update.state.selection.main.to
                  )
                    current = total
                }
              }
              find.current.report({ current, total })
            }
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(externalChange),
              )
            ) {
              const text = update.state.doc.toString()
              const changes: { from: number; to: number; insert: string }[] = []
              if (sourceBuffer.current!.nativeLineBreaks)
                update.changes.iterChanges(
                  (from, to, _fromB, _toB, inserted) => {
                    changes.push({ from, to, insert: inserted.toString() })
                  },
                )
              const undo = update.transactions.some(
                (transaction) =>
                  transaction.isUserEvent('undo') ||
                  transaction.isUserEvent('redo'),
              )
              const source =
                exactChange.current ??
                (undo ? sourceHistory.current.get(text) : undefined) ??
                (sourceBuffer.current!.nativeLineBreaks
                  ? sourceBuffer.current!.apply(changes)
                  : text)
              remember.current(source)
              change.current(source)
            }
          }),
        ],
      }),
    })
    view.current = editor
    remember.current(sourceBuffer.current!.source)
    const removeAnnotations = observeSourceAnnotations(editor)
    const unregisterProjection = documentProjections.register(
      'source',
      (cached) => {
        const context = editContext.current
        const current = editorDocument.get()
        if (
          !context.editTarget ||
          context.disabled ||
          !context.inputReady ||
          !current ||
          current.tabId !== context.document.tabId ||
          current.revision !== context.document.revision ||
          sourceBuffer.current!.source !== current.markdown
        )
          return null
        return (
          cached ??
          textProjection(current.markdown, parserOptions.current.markdownMode)
        )
      },
    )
    const unregisterEdits = documentEdits.register((request) => {
      const context = editContext.current
      const current = editorDocument.get()
      if (
        !current ||
        !sourceEditMatches(request, current) ||
        current.tabId !== context.document.tabId ||
        current.revision !== context.document.revision
      )
        return {
          status: 'stale',
          message: 'The document changed. Review the edits again.',
        }
      if (context.disabled || !context.inputReady)
        return {
          status: 'busy',
          message: 'The editor is not ready for changes.',
        }
      if (!context.editTarget)
        return {
          status: 'unsupported-view',
          message: 'Open source view to apply these edits.',
        }
      if (editor.composing)
        return {
          status: 'composing',
          message: 'Finish composing text before applying edits.',
        }
      const source = sourceBuffer.current!.source
      if (source !== current.markdown)
        return {
          status: 'stale',
          message: 'The editor is synchronizing. Review the edits again.',
        }
      let expected: string
      try {
        expected = editedSource(source, request.changes, MAX_DOCUMENT_BYTES)
        if (expected === source)
          return { status: 'applied', contentVersion: current.contentVersion }
      } catch (error) {
        return { status: 'invalid', message: String(error) }
      }
      const changes = request.changes.map((change) => ({
        from: sourceBuffer.current!.toEditor(change.from),
        to: sourceBuffer.current!.toEditor(change.to),
        insert: normalizeSource(change.insert),
      }))
      if (
        changes.some((change) => change.from === null || change.to === null) ||
        normalizeSource(expected) === sourceBuffer.current!.text
      )
        return {
          status: 'invalid',
          message:
            'Edits must keep line-ending pairs intact. Use a whole-source transform to change only line endings.',
        }
      const transaction = editor.state.update({
        changes: changes.map((change) => ({
          from: change.from!,
          to: change.to!,
          insert: change.insert,
        })),
        annotations: [
          isolateHistory.of('full'),
          Transaction.userEvent.of('input.addon'),
        ],
      })
      if (transaction.newDoc.toString() !== normalizeSource(expected))
        return {
          status: 'invalid',
          message: 'An editor extension changed this edit.',
        }
      exactChange.current = expected
      try {
        editor.dispatch(transaction)
      } finally {
        exactChange.current = null
      }
      return {
        status: 'applied',
        contentVersion: editorDocument.get()!.contentVersion,
      }
    })
    let disposed = false
    const unregister = registerSourceView(
      editor,
      (raw) => {
        const anchor = sourceBuffer.current!.toEditor(raw)
        if (anchor !== null)
          editor.dispatch({
            selection: { anchor },
            effects: EditorView.scrollIntoView(anchor, {
              y: 'start',
              yMargin: 48,
            }),
          })
      },
      {
        toSource: (position) => sourceBuffer.current!.toSource(position),
        toEditor: (position) => sourceBuffer.current!.toEditor(position),
      },
    )
    configureParser.current = () => {
      const id = parserOptions.current.codeLanguage
      const enabled = () =>
        codeLanguages
          .snapshot()
          .some(
            (entry) =>
              (entry.id === id || entry.aliases.includes(id ?? '')) &&
              entry.enabled,
          )
      const waiting = !!id && enabled() && !codeLanguages.resolve(id)
      setLanguageReady(!waiting)
      setLanguageError('')
      if (waiting)
        void codeLanguages.ensure(id).then((language) => {
          if (
            !disposed &&
            parserOptions.current.codeLanguage === id &&
            !language &&
            enabled()
          )
            setLanguageError(`Could not load the ${id} editor language.`)
        })
      editor.dispatch({ effects: language.reconfigure(markdown()) })
      formatting.current = sourceFormatting(
        editor,
        parserOptions.current.sourceFormat ??
          (parserOptions.current.markdownMode ? 'markdown' : null),
        parserOptions.current.supportsMedia,
      )
      reportFormatting.current(formatting.current)
    }
    const unsubscribe = codeLanguages.subscribe(() => configureParser.current())
    configureParser.current()
    const measure = () => {
      if (!disposed)
        editor.requestMeasure({
          read: () => null,
          write: () => setMeasured(true),
        })
    }
    void window.document.fonts.load('13px "Geist Mono"').then(measure, measure)
    return () => {
      unsubscribe()
      configureParser.current = () => {}
      disposed = true
      formatting.current = null
      reportFormatting.current(null)
      unregister()
      unregisterEdits()
      unregisterProjection()
      removeAnnotations()
      editor.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    let canceled = false
    const editor = view.current
    setExtensionError('')
    void Promise.all(
      sourceExtensions.map(async (extension) => extension.create()),
    )
      .then((extensions) => {
        if (!canceled && editor) {
          editor.dispatch({ effects: addons.current.reconfigure(extensions) })
          setInstalledExtensions(sourceExtensions)
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setExtensionError(String(error))
        }
      })
    return () => {
      canceled = true
    }
  }, [sourceExtensions])
  useEffect(() => {
    ready.current(
      extensionError || languageError
        ? 'failed'
        : inputReady && measured
          ? 'ready'
          : 'loading',
    )
  }, [inputReady, measured, extensionError, languageError])

  useEffect(() => {
    // Only reconcile edits from the other pane; never replay our own stale props.
    if (!active || appliedRevision.current === externalRevision) return
    appliedRevision.current = externalRevision
    const editor = view.current
    if (editor && sourceBuffer.current?.source !== value) {
      sourceBuffer.current = sourceText(value)
      sourceHistory.current.clear()
      remember.current(value)
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: normalizeSource(value),
        },
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      })
    }
  }, [active, value, externalRevision])

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorView.editable.of(!disabled && inputReady),
        EditorState.readOnly.of(disabled || !inputReady),
      ]),
    })
  }, [disabled, inputReady])

  useEffect(() => {
    view.current?.dispatch({
      effects: numbers.current.reconfigure(
        showLineNumbers
          ? lineNumbers({
              domEventHandlers: {
                mousedown(view, line, event) {
                  event.preventDefault()
                  const text = view.state.doc.lineAt(line.from)
                  view.dispatch({
                    selection: { anchor: text.from, head: text.to },
                  })
                  view.focus()
                  return true
                },
              },
            })
          : [],
      ),
    })
  }, [showLineNumbers])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    if (!findActive) {
      closeSearchPanel(editor)
      return
    }
    openSearchPanel(editor)
    const query = new SearchQuery({ search: findQuery, literal: true })
    editor.dispatch({ effects: setSearchQuery.of(query) })
    const first = query.valid ? query.getCursor(editor.state).next() : null
    if (first && !first.done)
      editor.dispatch({
        selection: { anchor: first.value.from, head: first.value.to },
        scrollIntoView: true,
      })
  }, [findActive, findQuery])

  useEffect(() => {
    if (handledFindMove.current === findMove.id) return
    handledFindMove.current = findMove.id
    if (findActive && view.current && findMove.id)
      (findMove.direction === 'next' ? findNext : findPrevious)(view.current)
  }, [findActive, findMove])

  return (
    <>
      {(extensionError || languageError) && (
        <DocumentNotice
          title="Editor addon unavailable"
          message={extensionError || languageError}
        />
      )}
      <div className="source-editor" ref={host} />
    </>
  )
}
