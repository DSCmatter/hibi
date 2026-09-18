import type { EditorView } from '@codemirror/view'

const mounted = new WeakMap<
  HTMLElement,
  {
    view: EditorView
    reveal: (position: number) => void
    positions?: {
      toSource: (position: number) => number
      toEditor: (position: number) => number | null
    }
  }
>()

export function registerSourceView(
  view: EditorView,
  reveal: (position: number) => void,
  positions?: {
    toSource: (position: number) => number
    toEditor: (position: number) => number | null
  },
) {
  mounted.set(view.dom, { view, reveal, ...(positions ? { positions } : {}) })
  return () => mounted.delete(view.dom)
}
export const sourcePosition = (view: EditorView, position: number) =>
  mounted.get(view.dom)?.positions?.toSource(position) ?? position
export const editorPosition = (view: EditorView, position: number) => {
  const positions = mounted.get(view.dom)?.positions
  return positions ? positions.toEditor(position) : position
}

export function sourceView(element: Element): EditorView | null {
  const host = element.closest<HTMLElement>('.cm-editor')
  return host ? (mounted.get(host)?.view ?? null) : null
}

export function revealSourcePosition(view: EditorView, position: number) {
  mounted.get(view.dom)?.reveal(position)
}
