import type { Editor, EditorEvents } from '@tiptap/core'
import type { DocumentState } from '../../shared/desktop'

export function observeRichCounts(
  editor: Editor,
  getDocument: () => Readonly<DocumentState> | null,
  refresh: () => void,
) {
  const capture = () => {
    const document = getDocument()
    return document
      ? {
          tabId: document.tabId,
          revision: document.revision,
          contentVersion: document.contentVersion,
          doc: editor.state.doc,
        }
      : null
  }
  // The host synchronizes before attach and commits before transaction events.
  let observed = capture()
  const transaction = ({
    transaction,
    appendedTransactions,
  }: EditorEvents['transaction']) => {
    if (
      !transaction.docChanged &&
      !appendedTransactions.some((appended) => appended.docChanged)
    )
      return
    observed = capture()
    refresh()
  }
  editor.on('transaction', transaction)
  return {
    read(document: Readonly<DocumentState>) {
      if (
        editor.isDestroyed ||
        !observed ||
        observed.tabId !== document.tabId ||
        observed.revision !== document.revision ||
        observed.contentVersion !== document.contentVersion ||
        observed.doc !== editor.state.doc
      )
        return null
      return editor.getText({ blockSeparator: '\n' })
    },
    stop() {
      editor.off('transaction', transaction)
      observed = null
    },
  }
}
