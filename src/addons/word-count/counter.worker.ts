import { countText } from './count'

self.onmessage = (event: MessageEvent<string>) => {
  self.postMessage(countText(event.data))
}
