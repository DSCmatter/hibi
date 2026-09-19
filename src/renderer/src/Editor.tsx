import type { Editor, EditorEvents } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as RichNode } from '@tiptap/pm/model'
import { AllSelection, TextSelection } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  findNext,
  findPrev,
  getMatchHighlights,
  getSearchState,
  SearchQuery,
  setSearchState,
} from 'prosemirror-search'
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  DocumentFormat,
  MarkdownExtension,
  MarkdownFlavor,
  RichExtension,
  SourceExtension,
} from '../../addons/api'
import type { DocumentState } from '../../shared/desktop'
import { MAX_DOCUMENT_BYTES } from '../../shared/desktop'
import { editedSource, sourceEditMatches } from '../../shared/document-edits'
import type { AcceptedSourceEdit } from '../../shared/document-session'
import type { DocumentView } from '../../shared/document-types'
import { isMediaFile } from '../../shared/media'
import { Button } from '../../ui/Controls'
import { DocumentNotice } from '../../ui/DocumentNotice'
import { performanceDiagnostics } from '../../ui/diagnostics'
import { documentImage } from './DocumentImage'
import { documentEdits } from './document-edits'
import { editorDocument } from './document-formats'
import { documentHistory } from './document-history'
import { documentProjections } from './document-projections'
import { documentRuntime } from './document-runtime'
import { type CursorSettings, EditorCursor } from './EditorCursor'
import { emitEditorKeyEvent } from './editor-events'
import { FindBar, type FindMove, type FindStatus } from './FindBar'
import { useFormattingToolbar } from './FormattingToolbar'
import { LoadingScreen } from './LoadingScreen'
import { linkScroll } from './linked-scroll'
import { MirrorCursor } from './MirrorCursor'
import {
  editorExtensions,
  needsSourceEditing,
  projectMarkdown,
} from './markdown'
import { observeMarkdownMarkers } from './markdown-markers'
import { markdownPositions } from './markdown-positions'
import './markdown-markers.css'
import { markdownSerializer } from './markdown-serialization'
import { markdownSyntax } from './markdown-syntax'
import type { OutlineHeading, OutlineRequest } from './OutlineSidebar'
import { outlineHeadingAt } from './outline-position'
import { observeRichAnnotations } from './rich-annotations'
import {
  richSourceEcho,
  richSourceSession,
  richSourceSnapshot,
} from './rich-source-session'
import { exactRichRange } from './rich-text-range'
import { revealSourcePosition, sourcePosition, sourceView } from './source-view'
import { textProjection } from './text-projection'
import { useEditorPanes } from './use-editor-panes'

const SourceEditor = lazy(() =>
  import('./MarkdownSourceEditor').then((module) => ({
    default: module.MarkdownSourceEditor,
  })),
)

export type ViewMode = DocumentView

export function MarkdownEditor({
  document: documentState,
  format,
  formatName,
  value,
  onChange,
  mode,
  disabled,
  findOpen,
  onCloseFind,
  markdownExtensions,
  sourceExtensions,
  richExtensions,
  cursorSettings,
  showLineNumbers,
  spellCheck,
  showMarkdownMarkers,
  documentRevision,
  flavors,
  unsupportedFlavor,
  onAttach,
  onLink,
  onOutline,
  onActiveOutline,
  outlineTarget,
  outlineActive,
}: {
  document: DocumentState
  format: DocumentFormat | undefined
  formatName: string
  value: string
  onChange: (value: string, historyGroup?: string) => void
  mode: ViewMode
  disabled: boolean
  findOpen: boolean
  onCloseFind: () => void
  markdownExtensions: readonly MarkdownExtension[]
  sourceExtensions: readonly SourceExtension[]
  richExtensions: readonly RichExtension[]
  cursorSettings: CursorSettings
  showLineNumbers: boolean
  spellCheck: boolean
  showMarkdownMarkers: boolean
  documentRevision: number
  flavors: readonly MarkdownFlavor[]
  unsupportedFlavor: boolean
  onAttach: (
    files: File[] | null,
  ) => Promise<import('../../shared/media').MediaAttachment[] | null>
  onLink: (href: string) => void
  onOutline: (headings: OutlineHeading[]) => void
  onActiveOutline: (id: string | null) => void
  outlineTarget: OutlineRequest | null
  outlineActive: boolean
}) {
  const markdownDocument = format?.editing === 'markdown'
  const exactSource = useRef<{ source: string; document: RichNode } | null>(
    null,
  )
  const exactHistory = useRef(
    new WeakMap<Editor, Map<string, { source: string; document: RichNode }>>(),
  )
  const serializers = useRef(
    new WeakMap<Editor, ReturnType<typeof markdownSerializer>>(),
  )
  const generated = useRef<{
    source: string
    body: string
    sourceOnly: boolean
    flavors: readonly MarkdownFlavor[]
    syntaxVersion: number
    adapters: readonly MarkdownExtension[]
  } | null>(null)
  const syntaxVersion = useSyncExternalStore(
    markdownSyntax.subscribe,
    markdownSyntax.version,
  )
  const projection = useMemo(
    () =>
      markdownDocument
        ? projectMarkdown(value, markdownExtensions)
        : { content: '', serialize: () => value, readOnly: true },
    [value, markdownExtensions, markdownDocument],
  )
  const sourceOnly = useMemo(
    () =>
      unsupportedFlavor ||
      Boolean(projection.readOnly) ||
      (generated.current?.source === value &&
      generated.current.body === projection.content &&
      generated.current.flavors === flavors &&
      generated.current.syntaxVersion === syntaxVersion &&
      generated.current.adapters === markdownExtensions
        ? generated.current.sourceOnly
        : needsSourceEditing(projection.content)),
    [
      projection,
      unsupportedFlavor,
      value,
      flavors,
      syntaxVersion,
      markdownExtensions,
    ],
  )
  const richHistoryGroup = useRef({ id: '', time: 0 })
  const [richInputError, setRichInputError] = useState('')
  const retryRich = useRef(() => {})
  const prepareRichRef = useRef(prepareRich)
  prepareRichRef.current = prepareRich
  const [richExtensionError, setRichExtensionError] = useState('')
  const [findQuery, setFindQuery] = useState('')
  const [findStatus, setFindStatus] = useState<FindStatus>({
    current: 0,
    total: 0,
  })
  const [findMove, setFindMove] = useState<FindMove>({
    id: 0,
    direction: 'next',
  })
  const handledFindMove = useRef(0)
  const {
    content,
    paneMode,
    focusedPane,
    setFocusedPane,
    sourceMounted,
    sourceReady,
    setSourceReady,
    setSourceSettled,
  } = useEditorPanes(mode, markdownDocument)
  const findTarget = !markdownDocument
    ? 'source'
    : mode === 'normal'
      ? 'rich'
      : mode === 'markdown'
        ? 'source'
        : focusedPane
  const scrollContent = useRef({ source: value, body: projection.content })
  scrollContent.current = { source: value, body: projection.content }
  // biome-ignore lint/correctness/useExhaustiveDependencies: capture the initial source stamp only when rebuilding the schema; normal edits synchronize through the source bridge.
  const extensions = useMemo(
    () => [
      ...editorExtensions(flavors, documentHistory),
      richSourceSession.configure({
        initialSource: {
          document: {
            tabId: documentState.tabId,
            revision: documentState.revision,
          },
          version: documentState.contentVersion,
        },
        prepare: (event) => prepareRichRef.current(event),
        reject: (error) => {
          generated.current = null
          setRichInputError(
            error instanceof Error ? error.message : String(error),
          )
        },
        reconciled: () => {
          setRichInputError('')
        },
      }),
      ...(markdownSyntax.enabled('core.images')
        ? [documentImage(documentRevision)]
        : []),
    ],
    [flavors, syntaxVersion, documentRevision],
  )
  const editor = useEditor(
    {
      extensions,
      content: projection.content,
      contentType: 'markdown',
      autofocus: false,
      injectCSS: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        handleKeyDown(view, event) {
          if (
            event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === 'a'
          ) {
            event.preventDefault()
            view.dispatch(
              view.state.tr.setSelection(new AllSelection(view.state.doc)),
            )
            return true
          }
          return false
        },
        attributes: {
          'aria-label': 'Document editor',
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
      onSelectionUpdate: ({ transaction }) => {
        if (!transaction.docChanged) richHistoryGroup.current.id = ''
      },
    },
    [markdownExtensions, flavors, syntaxVersion],
  )
  function prepareRich({
    editor,
    transaction,
    nextState,
  }: EditorEvents['beforeTransaction']): AcceptedSourceEdit | null {
    if (!markdownDocument) return null
    const known = richSourceSnapshot(editor),
      current = documentRuntime.session()?.snapshot()
    if (
      !known ||
      !current ||
      known.version !== current.version ||
      known.document.tabId !== current.document.tabId ||
      known.document.revision !== current.document.revision
    )
      throw new Error(
        'The editor is still synchronizing. Retry before editing this view.',
      )
    if (exactSource.current && !exactSource.current.document.eq(nextState.doc))
      throw new Error(
        'An editor extension changed this edit. Review the document before continuing.',
      )
    let serialize = serializers.current.get(editor)
    if (!serialize) {
      serialize = markdownSerializer(
        editor.markdown!,
        flavors.every((flavor) => flavor.serialization === 'block-local'),
      )
      serializers.current.set(editor, serialize)
    }
    const serialized = performanceDiagnostics.measure(
      'core',
      'Markdown serialization',
      () => serialize(nextState.doc),
    )
    const preserved =
      exactSource.current ??
      exactHistory.current.get(editor)?.get(serialized.source)
    const currentSource = documentRuntime.get()?.markdown ?? value
    const source = preserved?.document.eq(nextState.doc)
      ? preserved.source
      : projectMarkdown(currentSource, markdownExtensions).serialize(
          serialized.source,
        )
    const step = transaction.steps[0]
    const typing =
      !exactSource.current &&
      transaction.steps.length === 1 &&
      step instanceof ReplaceStep &&
      step.slice.content.childCount <= 1 &&
      (!step.slice.content.firstChild ||
        step.slice.content.firstChild.isText) &&
      !transaction.getMeta('uiEvent')
    const now = performance.now(),
      previous = richHistoryGroup.current
    if (!typing || !previous.id || now - previous.time > 500)
      previous.id = crypto.randomUUID()
    const accepted = performanceDiagnostics.measure(
      'core',
      'document update',
      () => documentRuntime.beginReplace(source, previous.id),
    )
    generated.current = {
      source,
      body: serialized.source,
      sourceOnly: serialized.sourceOnly,
      flavors,
      syntaxVersion,
      adapters: markdownExtensions,
    }
    previous.time = now
    if (!typing) previous.id = ''
    setRichInputError('')
    return accepted
  }
  useLayoutEffect(() => {
    const session = documentRuntime.session()
    if (!editor || !markdownDocument || !session) return
    let disposed = false,
      scheduled = false
    const sync = () => {
      scheduled = false
      if (disposed || editor.isDestroyed) return
      if (richSourceSnapshot(editor)?.version === session.snapshot().version) {
        setRichInputError('')
        return
      }
      const snapshot = session.snapshot(),
        source = snapshot.materialize()
      editor
        .chain()
        .setContent(projectMarkdown(source, markdownExtensions).content, {
          contentType: 'markdown',
          emitUpdate: false,
        })
        .command(({ tr }) => {
          tr.setMeta(richSourceEcho, snapshot)
          return true
        })
        .run()
      generated.current = null
      richHistoryGroup.current.id = ''
    }
    retryRich.current = sync
    const remove = session.subscribeOperations((prepared) => {
      if (
        prepared.operation.origin === 'visual' &&
        richSourceSnapshot(editor)?.version === prepared.after.version
      )
        return
      if (
        prepared.operation.origin === 'undo' ||
        prepared.operation.origin === 'redo'
      )
        sync()
      else if (!scheduled) {
        scheduled = true
        queueMicrotask(sync)
      }
    })
    sync()
    return () => {
      disposed = true
      retryRich.current = () => {}
      remove()
    }
  }, [editor, markdownDocument, markdownExtensions])
  useLayoutEffect(() => {
    if (!editor?.markdown || !markdownDocument) return
    const serialize = markdownSerializer(
      editor.markdown,
      flavors.every((flavor) => flavor.serialization === 'block-local'),
    )
    serializers.current.set(editor, serialize)
    performanceDiagnostics.measure(
      'core',
      'Markdown cache initialization',
      () => serialize(editor.state.doc),
    )
  }, [editor, markdownDocument, flavors])
  const richEditContext = useRef({
    document: documentState,
    mode,
    findTarget,
    disabled,
    sourceOnly,
    markdownExtensions,
  })
  richEditContext.current = {
    document: documentState,
    mode,
    findTarget,
    disabled,
    sourceOnly,
    markdownExtensions,
  }
  useEffect(() => {
    if (!editor?.markdown || !markdownDocument) return
    const body = () => {
      const context = richEditContext.current
      const current = editorDocument.get()
      if (
        editor.isDestroyed ||
        context.findTarget !== 'rich' ||
        context.mode === 'markdown' ||
        context.disabled ||
        context.sourceOnly ||
        !editor.isEditable ||
        !current ||
        current.tabId !== context.document.tabId ||
        current.revision !== context.document.revision
      )
        return null
      const projection = projectMarkdown(
        current.markdown,
        context.markdownExtensions,
      )
      if (
        projection.readOnly ||
        projection.sourceOffset === undefined ||
        projection.serialize(projection.content) !== current.markdown
      )
        return null
      return { current, projection }
    }
    const removeAnnotations = observeRichAnnotations(
      editor,
      () => body()?.projection ?? null,
    )
    const removeProjection = documentProjections.register('rich', (cached) => {
      const value = body()
      return value
        ? (cached ??
            textProjection(
              value.projection.content,
              true,
              value.projection.sourceOffset,
            ))
        : null
    })
    const removeEdits = documentEdits.register((request) => {
      const value = body()
      const unsupported = {
        status: 'unsupported-view' as const,
        message: 'This range needs source view.',
      }
      if (!value) return unsupported
      const { current, projection } = value
      if (!sourceEditMatches(request, current))
        return {
          status: 'stale',
          message: 'The document changed. Review the edits again.',
        }
      if (editor.view.composing)
        return {
          status: 'composing',
          message: 'Finish composing text before applying edits.',
        }
      if (request.changes.length > 32) return unsupported
      try {
        const source = editedSource(
          current.markdown,
          request.changes,
          MAX_DOCUMENT_BYTES,
        )
        if (source === current.markdown)
          return { status: 'applied', contentVersion: current.contentVersion }
        const offset = projection.sourceOffset!
        const suffix =
          current.markdown.length - offset - projection.content.length
        const nextBody = source.slice(offset, source.length - suffix)
        if (projection.serialize(nextBody) !== source) return unsupported
        const ranges = request.changes.map((change) => {
          if (/[\r\n]/.test(change.insert)) return null
          const range = exactRichRange(
            editor.state.doc,
            editor.markdown!,
            projection.content,
            change.from - offset,
            change.to - offset,
          )
          return range ? { ...range, insert: change.insert } : null
        })
        if (ranges.some((range) => !range)) return unsupported
        const tr = closeHistory(editor.state.tr)
        let boundary = editor.state.doc.content.size + 1
        for (const range of ranges.toReversed()) {
          if (!range || range.to > boundary) return unsupported
          boundary = range.from
          if (range.insert)
            tr.replaceWith(
              range.from,
              range.to,
              editor.schema.text(range.insert, range.marks),
            )
          else tr.delete(range.from, range.to)
        }
        const expected = editor.schema.nodeFromJSON(
          editor.markdown!.parse(nextBody),
        )
        if (
          !tr.doc.eq(expected) ||
          !editor.state.applyTransaction(tr).state.doc.eq(expected)
        )
          return unsupported
        let history = exactHistory.current.get(editor)
        if (!history) {
          history = new Map()
          exactHistory.current.set(editor, history)
        }
        history.set(editor.markdown!.serialize(editor.state.doc.toJSON()), {
          source: current.markdown,
          document: editor.state.doc,
        })
        history.set(editor.markdown!.serialize(expected.toJSON()), {
          source,
          document: expected,
        })
        let size = [...history].reduce(
          (size, [body, entry]) => size + body.length + entry.source.length,
          0,
        )
        while (history.size > 32 || size > 8 * 1024 * 1024) {
          const first = history.keys().next().value!
          size -= first.length + history.get(first)!.source.length
          history.delete(first)
        }
        exactSource.current = { source, document: expected }
        editor.view.dispatch(tr)
        editor.view.dispatch(closeHistory(editor.state.tr))
        if (!editor.state.doc.eq(expected))
          return {
            status: 'invalid',
            message:
              'An editor extension changed this edit. Review the document before continuing.',
          }
        return {
          status: 'applied',
          contentVersion: editorDocument.get()!.contentVersion,
        }
      } catch (error) {
        return { status: 'invalid', message: String(error) }
      } finally {
        exactSource.current = null
      }
    }, 'rich')
    return () => {
      removeEdits()
      removeProjection()
      removeAnnotations()
    }
  }, [editor, markdownDocument])
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial focus belongs to this editor instance, never subsequent mode or document updates.
  useLayoutEffect(() => {
    if (!editor || !markdownDocument || paneMode === 'markdown') return
    const focus = () => {
      if (editor.isDestroyed || !editor.view.dom.isConnected) return
      const active = window.document.activeElement
      if (
        active?.closest(
          '.settings-screen, [role="dialog"], .source-pane, input, textarea, select',
        )
      )
        return
      editor.view.dispatch(
        editor.state.tr
          .setSelection(TextSelection.atEnd(editor.state.doc))
          .setMeta('addToHistory', false),
      )
      editor.view.focus()
    }
    editor.on('mount', focus)
    focus()
    return () => {
      editor.off('mount', focus)
    }
  }, [editor])
  useEffect(() => {
    if (!editor || !markdownDocument) {
      onOutline([])
      onActiveOutline(null)
      return
    }
    if (!outlineActive) return
    const root = content.current
    let frame = 0
    let document: typeof editor.state.doc | null = null
    let headings: OutlineHeading[] = []
    let sourceHeadings: { id: string; start: number }[] = []
    let mappedBody: string | null = null
    const report = () => {
      frame = 0
      if (editor.isDestroyed) return
      if (document !== editor.state.doc) {
        document = editor.state.doc
        headings = []
        document.descendants((node, pos) => {
          if (node.type.name === 'heading')
            headings.push({
              id: String(pos),
              label: node.textContent || 'Untitled heading',
              level: Number(node.attrs.level),
            })
        })
        mappedBody = null
        onOutline(headings)
      }
      let selected: string | null = null
      if (findTarget === 'source') {
        const element = root?.querySelector<HTMLElement>('.cm-content')
        const view = element && sourceView(element)
        const { source, body } = scrollContent.current
        const offset = source.lastIndexOf(body)
        if (
          sourceReady &&
          view &&
          offset >= 0 &&
          sourcePosition(view, view.state.selection.main.head) >= offset
        ) {
          if (mappedBody !== body) {
            const map = markdownPositions(body, document)
            sourceHeadings = headings.flatMap((heading) => {
              const position = map(Number(heading.id) + 1, 'rich')
              return position === null
                ? []
                : [
                    {
                      id: heading.id,
                      start: body.lastIndexOf('\n', position - 1) + 1,
                    },
                  ]
            })
            mappedBody = body
          }
          const position =
            sourcePosition(view, view.state.selection.main.head) - offset
          selected =
            outlineHeadingAt(
              sourceHeadings,
              position,
              (heading) => heading.start,
            )?.id ?? null
        }
      } else {
        selected =
          outlineHeadingAt(headings, editor.state.selection.head, (heading) =>
            Number(heading.id),
          )?.id ?? null
      }
      onActiveOutline(selected)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }
    editor.on('transaction', schedule)
    root?.addEventListener('hibi:source-caret', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      root?.removeEventListener('hibi:source-caret', schedule)
    }
  }, [
    content,
    editor,
    markdownDocument,
    outlineActive,
    findTarget,
    sourceReady,
    onOutline,
    onActiveOutline,
  ])
  const handledOutline = useRef<OutlineRequest | null>(outlineTarget)
  // biome-ignore lint/correctness/useExhaustiveDependencies: these transitions invalidate the exact projection even when text is unchanged.
  useEffect(() => {
    documentProjections.invalidate()
  }, [mode, findTarget, sourceReady, syntaxVersion, flavors])
  useEffect(() => {
    if (!editor || !outlineTarget || handledOutline.current === outlineTarget)
      return
    if (mode !== 'normal' && !sourceReady) return
    const position = Number(outlineTarget.id)
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= editor.state.doc.content.size ||
      editor.state.doc.nodeAt(position)?.type.name !== 'heading'
    )
      return
    if (mode === 'normal') {
      handledOutline.current = outlineTarget
      editor
        .chain()
        .focus()
        .setTextSelection(position + 1)
        .scrollIntoView()
        .run()
    } else {
      const element = content.current?.querySelector<HTMLElement>('.cm-content')
      const view = element && sourceView(element)
      if (!view) return
      const offset = value.lastIndexOf(projection.content)
      const mapped = markdownPositions(projection.content, editor.state.doc)(
        position + 1,
        'rich',
      )
      if (offset < 0 || mapped === null) return
      handledOutline.current = outlineTarget
      revealSourcePosition(view, offset + mapped)
      view.focus()
    }
  }, [
    content,
    editor,
    outlineTarget,
    mode,
    sourceReady,
    value,
    projection.content,
  ])
  useEffect(() => {
    if (paneMode !== 'side-by-side' || !sourceReady || !editor) return
    const rich = content.current?.querySelector<HTMLElement>('.rich-pane')
    const source = content.current?.querySelector<HTMLElement>('.cm-scroller')
    if (!rich || !source) return
    return linkScroll(
      rich,
      source,
      source.contains(window.document.activeElement) ? source : rich,
      markdownDocument
        ? { editor, content: () => scrollContent.current }
        : undefined,
    )
  }, [content, paneMode, sourceReady, editor, markdownDocument])
  const { attachSource: attachSourceFormatting, attachFiles } =
    useFormattingToolbar(
      editor,
      paneMode,
      focusedPane,
      disabled ||
        mode !== paneMode ||
        (findTarget === 'rich' && (sourceOnly || !!richExtensionError)),
      onAttach,
      markdownDocument,
      format,
    )

  useLayoutEffect(() => {
    if (!editor) return
    editor.setEditable(!sourceOnly && !disabled && !richExtensionError, false)
  }, [editor, sourceOnly, disabled, richExtensionError])

  useEffect(() => {
    if (!editor) return
    const apply = () => {
      if (!editor.isDestroyed)
        editor.view.dom.setAttribute('spellcheck', String(spellCheck))
    }
    editor.on('mount', apply)
    apply()
    return () => {
      editor.off('mount', apply)
    }
  }, [editor, spellCheck])

  useLayoutEffect(() => {
    if (
      !editor ||
      !showMarkdownMarkers ||
      !markdownDocument ||
      sourceOnly ||
      mode === 'markdown'
    )
      return
    return observeMarkdownMarkers(editor)
  }, [editor, showMarkdownMarkers, markdownDocument, sourceOnly, mode])

  useLayoutEffect(() => {
    if (!editor) return
    let detach: (() => void)[] = []
    const cleanup = () => {
      for (const remove of detach) remove()
      detach = []
    }
    const attach = () => {
      cleanup()
      setRichExtensionError('')
      if (editor.isDestroyed) return
      try {
        for (const extension of richExtensions)
          detach.push(extension.attach(editor))
      } catch (error) {
        cleanup()
        editor.setEditable(false, false)
        setRichExtensionError(String(error))
      }
    }
    editor.on('mount', attach)
    editor.on('unmount', cleanup)
    attach()
    return () => {
      editor.off('mount', attach)
      editor.off('unmount', cleanup)
      cleanup()
    }
  }, [editor, richExtensions])

  useEffect(() => {
    if (!editor || !findOpen || findTarget !== 'rich') return
    const report = () => {
      const matches = getMatchHighlights(editor.state).find()
      const selection = editor.state.selection
      setFindStatus({
        total: matches.length,
        current:
          matches.findIndex(
            (match) =>
              match.from === selection.from && match.to === selection.to,
          ) + 1,
      })
    }
    editor.on('transaction', report)
    report()
    return () => {
      editor.off('transaction', report)
    }
  }, [editor, findOpen, findTarget])

  useEffect(() => {
    if (!editor) return
    const query = new SearchQuery({
      search: findOpen && findTarget === 'rich' ? findQuery : '',
      literal: true,
    })
    if (!query.valid && !getSearchState(editor.state)?.query.valid) return
    editor.view.dispatch(setSearchState(editor.state.tr, query))
    const first = query.valid ? query.findNext(editor.state, 0) : null
    if (first)
      editor.view.dispatch(
        editor.state.tr
          .setSelection(
            TextSelection.create(editor.state.doc, first.from, first.to),
          )
          .scrollIntoView(),
      )
  }, [editor, findQuery, findOpen, findTarget])

  useEffect(() => {
    if (handledFindMove.current === findMove.id) return
    handledFindMove.current = findMove.id
    if (editor && findOpen && findTarget === 'rich' && findMove.id) {
      const command = findMove.direction === 'next' ? findNext : findPrev
      command(editor.state, (transaction) => editor.view.dispatch(transaction))
    }
  }, [editor, findMove, findOpen, findTarget])

  function updateFromSource(markdown: string) {
    onChange(markdown)
  }

  return (
    <>
      <FindBar
        open={findOpen}
        query={findQuery}
        onQuery={setFindQuery}
        status={findStatus}
        onMove={(direction) =>
          setFindMove((move) => ({ id: move.id + 1, direction }))
        }
        onClose={() => {
          onCloseFind()
          if (findTarget === 'rich') editor?.commands.focus()
          else
            window.document
              .querySelector<HTMLElement>('.source-pane .cm-content')
              ?.focus()
        }}
      />
      <main
        className={`editor-panes mode-${paneMode}`}
        data-source-ready={sourceReady}
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
            '.tiptap a[href], .format-content a[href]',
          )
          if (!link || (!link.closest('.format-content') && !event.shiftKey))
            return
          event.preventDefault()
          event.stopPropagation()
          onLink(link.getAttribute('href')!)
        }}
        onDropCapture={(event) => {
          const files = Array.from(event.dataTransfer.files)
          if (!files.length || !files.every(isMediaFile)) return
          event.preventDefault()
          event.stopPropagation()
          const pane = (event.target as HTMLElement).closest('.source-pane')
            ? 'source'
            : 'rich'
          void attachFiles(files, pane, { x: event.clientX, y: event.clientY })
        }}
        onKeyDownCapture={(event) => emitEditorKeyEvent(event.nativeEvent)}
        onKeyUpCapture={(event) => emitEditorKeyEvent(event.nativeEvent)}
      >
        <div className="editor-content" ref={content}>
          <EditorCursor root={content} settings={cursorSettings} />
          <MirrorCursor
            editor={editor}
            root={content}
            source={value}
            body={projection.content}
            active={
              paneMode === 'side-by-side' &&
              sourceReady &&
              !disabled &&
              !sourceOnly
            }
          />
          <section
            className="rich-pane"
            onFocusCapture={() => setFocusedPane('rich')}
            aria-label="Formatted document"
            aria-hidden={paneMode === 'markdown'}
            inert={paneMode === 'markdown'}
          >
            {markdownDocument &&
              markdownExtensions.map(({ id, Editor }) =>
                Editor ? (
                  <Editor
                    key={id}
                    value={value}
                    disabled={disabled}
                    onChange={(markdown) => {
                      updateFromSource(markdown)
                    }}
                  />
                ) : null,
              )}
            <div className="rich-editor-host" hidden={!markdownDocument}>
              {markdownDocument && sourceOnly && !richExtensionError && (
                <div className="source-notice">
                  <DocumentNotice
                    variant="warning"
                    title="Edit this document in source view"
                  />
                </div>
              )}
              {richExtensionError && (
                <DocumentNotice
                  title="Editor addon unavailable"
                  message={richExtensionError}
                />
              )}
              {richInputError && (
                <DocumentNotice
                  title="Edit could not be applied"
                  message={richInputError}
                >
                  {editor &&
                    richSourceSnapshot(editor)?.version !==
                      documentState.contentVersion && (
                      <Button onClick={() => retryRich.current()}>Retry</Button>
                    )}
                </DocumentNotice>
              )}
              <EditorContent editor={editor} />
            </div>
          </section>
          <section
            className="source-pane"
            onFocusCapture={() => setFocusedPane('source')}
            aria-label="Document source"
            aria-hidden={paneMode === 'normal'}
            inert={paneMode === 'normal'}
          >
            {sourceMounted && (
              <Suspense
                fallback={
                  <LoadingScreen label={`Loading ${formatName} editor`} />
                }
              >
                <SourceEditor
                  document={documentState}
                  editTarget={findTarget === 'source'}
                  markdownMode={markdownDocument}
                  sourceLanguage={format?.language}
                  sourceFormat={format?.formatting}
                  supportsMedia={!!format?.insertMedia}
                  codeLanguage={format?.codeLanguage}
                  label={formatName}
                  onLink={onLink}
                  onFormatting={attachSourceFormatting}
                  sourceExtensions={sourceExtensions}
                  showLineNumbers={showLineNumbers}
                  onReady={(status) => {
                    setSourceReady(status === 'ready')
                    if (status !== 'loading') setSourceSettled(true)
                  }}
                  disabled={disabled}
                  findActive={findOpen && findTarget === 'source'}
                  findQuery={findQuery}
                  findMove={findMove}
                  onFindStatus={setFindStatus}
                />
              </Suspense>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
