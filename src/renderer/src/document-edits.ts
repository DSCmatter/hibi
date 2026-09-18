import {
  parseSourceEditRequest,
  type SourceEditRequest,
  type SourceEditResult,
  sourceEditMatches,
} from '../../shared/document-edits.ts'
import { editorDocument } from './document-formats'

let handler: ((request: SourceEditRequest) => SourceEditResult) | null = null
let applying = false
export const documentEdits = {
  register(next: NonNullable<typeof handler>) {
    handler = next
    return () => {
      if (handler === next) handler = null
    }
  },
  scope(isBusy: () => boolean) {
    let disposed = false
    let cachedSize = 0
    const results = new Map<
      string,
      { fingerprint: string; result: SourceEditResult }
    >()
    return {
      dispose() {
        disposed = true
        results.clear()
        cachedSize = 0
      },
      apply(value: SourceEditRequest): SourceEditResult {
        if (disposed)
          return { status: 'disposed', message: 'This addon has stopped.' }
        if (applying)
          return {
            status: 'busy',
            message: 'An edit is already being applied.',
          }
        let request: SourceEditRequest
        try {
          request = parseSourceEditRequest(value)
        } catch (error) {
          return { status: 'invalid', message: String(error) }
        }
        const fingerprint = JSON.stringify(request)
        if (fingerprint.length > 8 * 1024 * 1024)
          return {
            status: 'invalid',
            message: 'The serialized edit request is too large.',
          }
        const previous = results.get(request.requestId)
        if (previous)
          return previous.fingerprint === fingerprint
            ? previous.result
            : {
                status: 'invalid',
                message:
                  'This request ID was already used for different edits.',
              }
        applying = true
        try {
          const current = editorDocument.get()
          const result: SourceEditResult = isBusy()
            ? {
                status: 'busy',
                message: 'The document is busy. Try again in a moment.',
              }
            : !current || !sourceEditMatches(request, current)
              ? {
                  status: 'stale',
                  message: 'The document changed. Review the edits again.',
                }
              : (handler?.(request) ?? {
                  status: 'unsupported-view',
                  message: 'Open source view to apply these edits.',
                })
          Object.freeze(result)
          results.set(request.requestId, { fingerprint, result })
          cachedSize += fingerprint.length
          while (results.size > 128 || cachedSize > 8 * 1024 * 1024) {
            const oldest = results.keys().next().value!
            cachedSize -= results.get(oldest)!.fingerprint.length
            results.delete(oldest)
          }
          return result
        } finally {
          applying = false
        }
      },
    }
  },
}
