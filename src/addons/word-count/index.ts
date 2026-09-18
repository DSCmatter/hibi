import type { Editor } from '@tiptap/core'
import { isMarkdownDocument } from '../../shared/document-types'
import { defineAddon } from '../api'
import type { countText } from './count'
import manifest from './manifest'

let stop: (() => void) | undefined
export default defineAddon({
  manifest,
  start(context) {
    const worker = new Worker(new URL('./counter.worker.ts', import.meta.url), {
      type: 'module',
    })
    const status = context.statusBar.register({ id: 'total', label: '' })
    let editor: Editor | null = null
    let frame = 0
    let pending = false
    let latest = ''
    let sent: string | undefined
    const send = () => {
      pending = true
      sent = latest
      worker.postMessage(latest)
    }
    worker.onmessage = (event: MessageEvent<ReturnType<typeof countText>>) => {
      pending = false
      if (latest !== sent) {
        send()
        return
      }
      const { words, characters } = event.data
      status.update({
        label: `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${characters.toLocaleString()} ${characters === 1 ? 'character' : 'characters'}`,
      })
    }
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const document = context.editor.getDocument()
        if (!document) return
        const rich =
          isMarkdownDocument(document.name) && editor && !editor.isDestroyed
            ? editor
            : null
        latest = rich
          ? rich.getText({ blockSeparator: '\n' })
          : document.markdown
        status.update({
          tooltip: `${rich ? 'Document text, excluding Markdown markup and properties' : 'Document source, including format markup'}. Characters include spaces and line breaks; emoji count as one character.`,
        })
        if (!pending && latest !== sent) send()
      })
    }
    context.editor.registerRich({
      id: 'text',
      attach(instance) {
        editor = instance
        const transaction = ({
          transaction,
        }: {
          transaction: { docChanged: boolean }
        }) => {
          if (transaction.docChanged) refresh()
        }
        instance.on('transaction', transaction)
        refresh()
        return () => {
          instance.off('transaction', transaction)
          if (editor === instance) editor = null
        }
      },
    })
    context.editor.onDocumentChange(refresh)
    stop = () => {
      cancelAnimationFrame(frame)
      worker.terminate()
    }
  },
  stop() {
    stop?.()
    stop = undefined
  },
})
