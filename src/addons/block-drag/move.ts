import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Fragment } from '@tiptap/pm/model'
import { NodeSelection, Selection } from '@tiptap/pm/state'

export function blockMove(editor: Editor, pos: number, direction: -1 | 1) {
  if (!editor.isEditable || pos < 0 || pos >= editor.state.doc.content.size)
    return null
  const $pos = editor.state.doc.resolve(pos)
  const parent = $pos.parent
  const index = $pos.index()
  const destination = index + direction
  if (destination < 0 || destination >= parent.childCount) return null
  const nodes = Array.from({ length: parent.childCount }, (_, i) =>
    parent.child(i),
  )
  const node = nodes[index]!
  const sibling = nodes[destination]!
  nodes[index] = sibling
  nodes[destination] = node
  const content = Fragment.fromArray(nodes)
  if (!parent.type.validContent(content)) return null
  const next = direction < 0 ? pos - sibling.nodeSize : pos + sibling.nodeSize
  const tr = closeHistory(editor.state.tr).replaceWith(
    $pos.start(),
    $pos.end(),
    content,
  )
  return tr
    .setSelection(
      NodeSelection.isSelectable(node)
        ? NodeSelection.create(tr.doc, next)
        : Selection.near(tr.doc.resolve(next)),
    )
    .scrollIntoView()
}
