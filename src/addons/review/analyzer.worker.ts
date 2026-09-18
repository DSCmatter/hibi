import type { TextProjection } from '../../shared/document-projection'
import { analyze } from './analyze'

self.onmessage = (event: MessageEvent<TextProjection>) => {
  self.postMessage({ id: event.data.id, findings: analyze(event.data) })
}
