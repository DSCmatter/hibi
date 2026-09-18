import type { EditorView } from '@codemirror/view'

const mounted = new WeakMap<
  HTMLElement,
  { view: EditorView; reveal: (position: number) => void }
>()

export function registerSourceView(
  view: EditorView,
  reveal: (position: number) => void,
) {
  mounted.set(view.dom, { view, reveal })
  return () => mounted.delete(view.dom)
}

export function sourceView(element: Element): EditorView | null {
  const host = element.closest<HTMLElement>('.cm-editor')
  return host ? (mounted.get(host)?.view ?? null) : null
}

export function revealSourcePosition(view: EditorView, position: number) {
  mounted.get(view.dom)?.reveal(position)
}
