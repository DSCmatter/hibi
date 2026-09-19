import { markdown } from '@codemirror/lang-markdown'
import type { ComponentProps } from 'react'
import { SourceEditor } from './SourceEditor'

/** Markdown's source support includes list keymaps and HTML completion. */
export function MarkdownSourceEditor(
  props: Omit<ComponentProps<typeof SourceEditor>, 'markdownLanguage'>,
) {
  return <SourceEditor {...props} markdownLanguage={markdown} />
}
