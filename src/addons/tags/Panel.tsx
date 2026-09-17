import { FileText, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isMarkdownDocument } from '../../shared/document-types'
import type { WorkspacePage } from '../../shared/workspace'
import type { AddonContext } from '../api'
import { Button, ControlRow, IconButton, Panel, TextInput } from '../ui'
import { useWorkspaceSnapshot } from '../workspace-snapshot'
import { noteTags } from './syntax'

export function TagsPanel({
  context,
  selection,
}: {
  context: AddonContext
  selection: unknown
}) {
  const { snapshot, workspace, loading, error, refresh } =
    useWorkspaceSnapshot(context)
  const [query, setQuery] = useState('')
  const [selected, select] = useState('')
  const parsed = useRef(new WeakMap<WorkspacePage, string[]>()).current
  useEffect(() => {
    const tag =
      selection && typeof selection === 'object' && 'tag' in selection
        ? selection.tag
        : undefined
    if (typeof tag === 'string') {
      select(tag)
      setQuery('')
    }
  }, [selection])
  const index = useMemo(() => {
    const tags = new Map<string, string[]>()
    for (const page of snapshot?.pages ?? []) {
      if (!isMarkdownDocument(page.path)) continue
      let pageTags = parsed.get(page)
      if (!pageTags) {
        pageTags = noteTags(page.markdown)
        parsed.set(page, pageTags)
      }
      for (const tag of pageTags)
        tags.set(tag, [...(tags.get(tag) ?? []), page.path])
    }
    return [...tags].sort(([a], [b]) => a.localeCompare(b))
  }, [snapshot, parsed])
  const matches = index.filter(([tag]) =>
    tag.includes(query.trim().replace(/^#/, '').toLowerCase()),
  )
  const files = index.find(([tag]) => tag === selected)?.[1] ?? []
  return (
    <Panel className="tags-panel">
      <ControlRow className="tags-controls">
        <TextInput
          type="search"
          aria-label="Filter tags"
          placeholder="Filter tags…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <IconButton
          aria-label="Refresh tags"
          title="Refresh tags"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={14} />
        </IconButton>
      </ControlRow>
      {error && <p role="alert">{error}</p>}
      {loading && !snapshot ? (
        <p role="status">Reading tags…</p>
      ) : !workspace ? (
        <Button onClick={() => void context.workspace.open().then(refresh)}>
          Open a folder
        </Button>
      ) : (
        <div className="tags-browser">
          <section className="tags-list" aria-label="Workspace tags">
            {matches.map(([tag, paths]) => (
              <Button
                variant="row"
                key={tag}
                aria-pressed={selected === tag}
                onClick={() => select(tag)}
              >
                <span>#{tag}</span>
                <span>{paths.length}</span>
              </Button>
            ))}
            {!matches.length && (
              <p>No tags found. write #tag in a note to add one.</p>
            )}
          </section>
          <section
            className="tags-files"
            aria-label={selected ? `Notes tagged #${selected}` : 'Tagged notes'}
          >
            <p>
              {selected
                ? `#${selected} · ${files.length} ${files.length === 1 ? 'note' : 'notes'}`
                : 'Select a tag to see its notes.'}
            </p>
            {files.map((path) => (
              <Button
                variant="row"
                key={path}
                onClick={() => {
                  void context.workspace.openFile(path)
                }}
              >
                <FileText size={14} aria-hidden="true" />
                <span title={path}>{path}</span>
              </Button>
            ))}
          </section>
        </div>
      )}
    </Panel>
  )
}
