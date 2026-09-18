import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { editorDocument } from './document-formats'
import { editorAnnotations } from './editor-annotations'

const replace = StateEffect.define<DecorationSet>()
const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(replace)) return effect.value
    return transaction.docChanged ? Decoration.none : value
  },
  provide: (field) => EditorView.decorations.from(field),
})
export const sourceAnnotationExtension = field
export function observeSourceAnnotations(view: EditorView) {
  let frame = 0
  const refresh = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const entries = editorAnnotations.forDocument(editorDocument.get())
      const marks = entries
        .filter(
          (entry) =>
            entry.to <= view.state.doc.length &&
            view.state.sliceDoc(entry.from, entry.to) === entry.expectedText,
        )
        .map((entry) =>
          Decoration.mark({
            class: 'editor-annotation',
            attributes: {
              title: entry.message,
              'data-severity': entry.severity ?? 'warning',
            },
          }).range(entry.from, entry.to),
        )
      if (!marks.length && !view.state.field(field).size) return
      view.dispatch({ effects: replace.of(Decoration.set(marks, true)) })
    })
  }
  const stop = editorAnnotations.subscribe(refresh)
  refresh()
  return () => {
    stop()
    cancelAnimationFrame(frame)
  }
}
