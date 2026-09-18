import type { DocumentState } from '../../shared/desktop'
import {
  projectionRange,
  type TextDecoration,
} from '../../shared/document-projection'
import { editorDocument } from './document-formats'
import { documentProjections } from './document-projections'

export type SourceAnnotation = TextDecoration & {
  tabId: string
  revision: number
  contentVersion: number
  expectedText: string
}
const owners = new Map<string, SourceAnnotation[]>()
const listeners = new Set<() => void>()
const publish = () => {
  for (const listener of listeners) listener()
}
editorDocument.subscribeChanges((document, change) => {
  if (!owners.size) return
  for (const [owner, entries] of owners) {
    const kept = entries.flatMap((entry) => {
      if (
        !document ||
        entry.tabId !== document.tabId ||
        entry.revision !== document.revision
      )
        return []
      if (entry.contentVersion === document.contentVersion) return [entry]
      if (!change || entry.contentVersion + 1 !== document.contentVersion)
        return []
      const shift = change.insert.length - (change.to - change.from)
      if (entry.from < change.to && entry.to > change.from) return []
      const from = entry.from + (entry.from >= change.to ? shift : 0)
      const to = entry.to + (entry.from >= change.to ? shift : 0)
      if (document.markdown.slice(from, to) !== entry.expectedText) return []
      return [{ ...entry, from, to, contentVersion: document.contentVersion }]
    })
    if (kept.length) owners.set(owner, kept)
    else owners.delete(owner)
  }
  publish()
})
export const editorAnnotations = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  forDocument(document: Readonly<DocumentState> | null) {
    return document
      ? [...owners.values()]
          .flat()
          .filter(
            (entry) =>
              entry.tabId === document.tabId &&
              entry.revision === document.revision &&
              entry.contentVersion === document.contentVersion,
          )
      : []
  },
  scope(owner: string) {
    let disposed = false
    const clear = () => {
      if (owners.delete(owner)) publish()
    }
    return {
      clear,
      dispose() {
        disposed = true
        clear()
      },
      set(projectionId: string, decorations: readonly TextDecoration[]) {
        if (disposed || !Array.isArray(decorations) || decorations.length > 32)
          return false
        const projection = documentProjections.get(),
          document = editorDocument.get()
        if (!projection || !document || projection.id !== projectionId)
          return false
        const entries: SourceAnnotation[] = []
        for (const decoration of decorations) {
          if (
            !decoration ||
            typeof decoration.id !== 'string' ||
            !/^[\w.:-]{1,128}$/.test(decoration.id) ||
            entries.some((entry) => entry.id === `${owner}.${decoration.id}`) ||
            typeof decoration.message !== 'string' ||
            decoration.message.length > 256 ||
            (decoration.severity !== undefined &&
              !['info', 'warning'].includes(decoration.severity))
          )
            return false
          const range = projectionRange(
            projection,
            decoration.from,
            decoration.to,
          )
          if (!range || range.from === range.to) return false
          entries.push({
            ...decoration,
            ...range,
            id: `${owner}.${decoration.id}`,
            tabId: document.tabId,
            revision: document.revision,
            contentVersion: document.contentVersion,
            expectedText: document.markdown.slice(range.from, range.to),
          })
        }
        owners.set(owner, entries)
        publish()
        return true
      },
    }
  },
}
