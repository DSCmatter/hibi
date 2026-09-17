import { RefreshCw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { AddonContext } from '../api'
import { Button, ControlRow, IconButton, Panel, TextInput } from '../ui'
import { useWorkspaceSnapshot } from '../workspace-snapshot'
import { GraphCanvas } from './Canvas'
import { noteGraph } from './model'

export function GraphPanel({ context }: { context: AddonContext }) {
  const { snapshot, workspace, loading, error, refresh } =
    useWorkspaceSnapshot(context)
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState(false)
  const previous = useRef<ReturnType<typeof noteGraph> | null>(null)
  const full = useMemo(() => {
    const next = noteGraph(snapshot?.pages ?? [])
    const last = previous.current
    if (
      last &&
      last.nodes.length === next.nodes.length &&
      last.edges.length === next.edges.length &&
      last.nodes.every((node, index) => node.id === next.nodes[index]?.id) &&
      last.edges.every(
        (edge, index) =>
          edge.source === next.edges[index]?.source &&
          edge.target === next.edges[index]?.target,
      )
    )
      return last
    previous.current = next
    return next
  }, [snapshot])
  const graph = useMemo(() => {
    const neighbors = new Set([workspace?.activePath])
    for (const edge of full.edges)
      if (
        edge.source === workspace?.activePath ||
        edge.target === workspace?.activePath
      ) {
        neighbors.add(edge.source)
        neighbors.add(edge.target)
      }
    const matching = full.nodes.filter(
      (node) =>
        node.id.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!local || neighbors.has(node.id)),
    )
    // ponytail: SVG caps at 500 visible notes; use a canvas renderer for larger simultaneous graphs.
    const nodes = matching.slice(0, 500),
      ids = new Set(nodes.map((node) => node.id))
    return {
      nodes,
      edges: full.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
      total: matching.length,
    }
  }, [full, query, local, workspace?.activePath])
  const open = (path: string) => {
    void context.workspace.openFile(path)
  }
  return (
    <Panel className="graph-panel">
      <ControlRow className="graph-controls">
        <TextInput
          type="search"
          aria-label="Filter graph notes"
          placeholder="Filter notes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          aria-pressed={local}
          disabled={!workspace?.activePath}
          onClick={() => setLocal((value) => !value)}
        >
          Current note
        </Button>
        <IconButton
          aria-label="Refresh graph"
          title="Refresh graph"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={14} />
        </IconButton>
      </ControlRow>
      {error && <p role="alert">{error}</p>}
      {loading && !snapshot ? (
        <p role="status">Reading workspace…</p>
      ) : !workspace ? (
        <Button onClick={() => void context.workspace.open().then(refresh)}>
          Open a folder
        </Button>
      ) : (
        <>
          <p className="graph-summary" role="status">
            {graph.nodes.length} of {graph.total} notes · {graph.edges.length}{' '}
            connections{graph.total > 500 ? ' · filter to see more notes' : ''}
          </p>
          {graph.nodes.length ? (
            <GraphCanvas
              graph={graph}
              active={workspace.activePath}
              open={open}
            />
          ) : (
            <p>No matching notes.</p>
          )}
          <p className="graph-help">
            Click a note to open it. drag notes or the background; scroll to
            zoom.
          </p>
        </>
      )}
    </Panel>
  )
}
