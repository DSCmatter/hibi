import {
  history as codeMirrorHistory,
  redo as codeMirrorRedo,
  undo as codeMirrorUndo,
  defaultKeymap,
  historyKeymap,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState as CodeMirrorState } from '@codemirror/state'
import {
  EditorView as CodeMirrorView,
  keymap as codeMirrorKeymap,
  Direction,
  drawSelection,
} from '@codemirror/view'
import { baseKeymap } from '@tiptap/pm/commands'
import { history, redo, undo } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import '../src/renderer/src/styles.css'
import '../src/renderer/src/toolbar.css'

declare global {
  interface Window {
    __bareConfig: {
      mode: 'source' | 'visual' | 'split'
      target: 'source' | 'visual'
      source: string
    }
    __bareInput: {
      sourceView: CodeMirrorView | null
      richView: EditorView | null
      codeMirror: {
        view: {
          EditorView: typeof CodeMirrorView
          Direction: typeof Direction
        }
      }
      getDocument: () => { markdown: string; contentVersion: number }
      undo: () => boolean
      redo: () => boolean
      setRichSelection: (position: number) => void
      onRichTransaction: (
        callback: (transaction: Transaction) => void,
      ) => () => void
      engineMetadata: Record<string, unknown>
    }
  }
}

const { mode, target, source } = window.__bareConfig
if (mode !== 'split' && mode !== target)
  throw new Error('The target must match the single-pane mode.')

// Reuse only static Hibi typography and pane geometry, never its application code.
// Fixed chrome reserves 36px titlebar + 46px toolbar + 32px status bar.
document.body.innerHTML = `
  <div class="app">
    <header class="titlebar" aria-hidden="true"></header>
    <div class="editor-surface">
      <div class="toolbar-slot" data-hidden="false" aria-hidden="true">
        <div class="toolbar-clip">
          <nav class="editor-toolbar"><span style="height:var(--control-height)"></span></nav>
        </div>
      </div>
      <div class="editor-page">
        <main class="editor-panes mode-${mode === 'source' ? 'markdown' : mode === 'visual' ? 'normal' : 'side-by-side'}">
          <div class="editor-content"></div>
        </main>
        <div class="statusbar-slot" aria-hidden="true"><section class="app-statusbar"></section></div>
      </div>
    </div>
  </div>`
const content = document.querySelector('.editor-content')
if (!content) throw new Error('The benchmark editor surface is missing.')
let sourceView: CodeMirrorView | null = null
let richView: EditorView | null = null
let contentVersion = 0
const richSubscribers = new Set<(transaction: Transaction) => void>()

function requireSourceView() {
  if (!sourceView) throw new Error('The source engine is not mounted.')
  return sourceView
}

function requireRichView() {
  if (!richView) throw new Error('The visual engine is not mounted.')
  return richView
}

if (mode !== 'visual') {
  const pane = document.createElement('section')
  pane.className = 'source-pane'
  pane.setAttribute('aria-label', 'Markdown source')
  pane.inert = target !== 'source'
  const host = document.createElement('div')
  host.className = 'source-editor'
  pane.append(host)
  content.append(pane)
  sourceView = new CodeMirrorView({
    parent: host,
    state: CodeMirrorState.create({
      doc: source,
      extensions: [
        markdown(),
        codeMirrorHistory(),
        codeMirrorKeymap.of([...historyKeymap, ...defaultKeymap]),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle),
        CodeMirrorView.lineWrapping,
        CodeMirrorState.readOnly.of(target !== 'source'),
        CodeMirrorView.editable.of(target === 'source'),
        CodeMirrorView.contentAttributes.of({
          role: 'textbox',
          'aria-label': 'Document editor',
          spellcheck: 'false',
        }),
        CodeMirrorView.updateListener.of((update) => {
          if (update.docChanged) contentVersion += 1
        }),
      ],
    }),
  })
}

if (mode !== 'source') {
  const pane = document.createElement('section')
  pane.className = 'rich-pane'
  pane.setAttribute('aria-label', 'Formatted document')
  pane.inert = target !== 'visual'
  const host = document.createElement('div')
  host.className = 'rich-editor-host'
  const mount = document.createElement('div')
  host.append(mount)
  pane.append(host)
  content.append(pane)
  const schema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: {
        content: 'text*',
        parseDOM: [{ tag: 'p' }],
        toDOM: () => ['p', 0],
      },
      text: { group: 'inline' },
    },
  })
  richView = new EditorView(mount, {
    state: EditorState.create({
      doc: schema.node(
        'doc',
        null,
        source
          .split('\n\n')
          .map((paragraph) =>
            schema.node(
              'paragraph',
              null,
              paragraph ? schema.text(paragraph) : null,
            ),
          ),
      ),
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo }),
        keymap(baseKeymap),
      ],
    }),
    editable: () => target === 'visual',
    attributes: {
      class: 'tiptap',
      role: 'textbox',
      'aria-label': 'Document editor',
      spellcheck: 'false',
    },
    dispatchTransaction(this: EditorView, transaction) {
      const result = this.state.applyTransaction(transaction)
      contentVersion += result.transactions.filter(
        (entry) => entry.docChanged,
      ).length
      this.updateState(result.state)
      for (const applied of result.transactions)
        for (const subscriber of richSubscribers) subscriber(applied)
    },
  })
}

window.__bareInput = {
  sourceView,
  richView,
  codeMirror: { view: { EditorView: CodeMirrorView, Direction } },
  getDocument() {
    // Materialize only at explicit harness checkpoints, never on an edit.
    if (target === 'source')
      return {
        markdown: requireSourceView().state.doc.toString(),
        contentVersion,
      }
    const paragraphs: string[] = []
    requireRichView().state.doc.forEach((paragraph) => {
      paragraphs.push(paragraph.textContent)
    })
    return { markdown: paragraphs.join('\n\n'), contentVersion }
  },
  undo() {
    if (target === 'source') return codeMirrorUndo(requireSourceView())
    const view = requireRichView()
    return undo(view.state, view.dispatch)
  },
  redo() {
    if (target === 'source') return codeMirrorRedo(requireSourceView())
    const view = requireRichView()
    return redo(view.state, view.dispatch)
  },
  setRichSelection(position) {
    const view = requireRichView()
    const resolved = view.state.doc.resolve(
      Math.max(0, Math.min(position, view.state.doc.content.size)),
    )
    view.focus()
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.near(resolved))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    )
  },
  onRichTransaction(callback) {
    richSubscribers.add(callback)
    return () => {
      richSubscribers.delete(callback)
    }
  },
  engineMetadata: {
    source: 'CodeMirror 6 with native markdown(), history and line wrapping',
    visual:
      'ProseMirror with paragraph/text schema, native history and keymaps',
    splitPeer: 'inert initial document; no synchronization',
    chrome:
      'fixed Hibi CSS geometry; titlebar 36px, toolbar 46px, status bar 32px',
    typography: 'Hibi static CSS fonts, wrapping and padding',
    saves: 'harness writes a snapshot; no application IPC or recovery journal',
  },
}
