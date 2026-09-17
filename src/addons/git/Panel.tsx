import { ArrowDown, ArrowUp, Minus, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AddonContext } from '../api'
import { Button, ControlRow, IconButton, Panel, Select, TextArea } from '../ui'
import type { GitFile, GitState } from './types'
import './git.css'

export function GitPanel({
  context,
  draft,
}: {
  context: AddonContext
  draft: { message: string }
}) {
  const [state, setState] = useState<GitState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(draft.message)
  function updateMessage(value: string) {
    draft.message = value
    setMessage(value)
  }
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)
  const run = useCallback(
    async (method: string, input?: unknown) => {
      setBusy(true)
      setError('')
      try {
        setState(
          await (method === 'state'
            ? context.native.query<GitState>(method)
            : context.native.invoke<GitState>(method, input)),
        )
        setDiff(null)
        if (method === 'commit') {
          draft.message = ''
          setMessage('')
        }
      } catch (error) {
        setError(String(error))
      } finally {
        setBusy(false)
      }
    },
    [context, draft],
  )
  useEffect(() => {
    void run('state')
  }, [run])
  async function preview(file: GitFile) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setDiff({
        path: file.path,
        text: await context.native.invoke<string>('diff', file.path),
      })
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="git-panel">
      <div className="git-branch">
        <Select
          aria-label="Git branch"
          disabled={busy || !state}
          value={state ? `refs/heads/${state.branch}` : ''}
          onChange={(event) => void run('switch', event.target.value)}
        >
          {state && !state.branches.includes(`refs/heads/${state.branch}`) && (
            <option value={`refs/heads/${state.branch}`}>{state.branch}</option>
          )}
          {state?.branches.map((branch) => (
            <option key={branch} value={branch}>
              {branch.replace(/^refs\/(heads|remotes)\//, '')}
            </option>
          ))}
        </Select>
      </div>
      <ControlRow className="git-actions">
        <IconButton
          aria-label="Refresh Git"
          title="Refresh Git"
          disabled={busy}
          onClick={() => void run('state')}
        >
          <RefreshCw size={14} />
        </IconButton>
        <IconButton
          aria-label={`Pull${state?.behind ? ` (${state.behind})` : ''}`}
          title="Pull"
          disabled={busy || !state}
          onClick={() => void run('pull')}
        >
          <ArrowDown size={14} />
          {state?.behind ? <span>{state.behind}</span> : null}
        </IconButton>
        <IconButton
          aria-label={`Push${state?.ahead ? ` (${state.ahead})` : ''}`}
          title="Push"
          disabled={busy || !state}
          onClick={() => void run('push')}
        >
          <ArrowUp size={14} />
          {state?.ahead ? <span>{state.ahead}</span> : null}
        </IconButton>
      </ControlRow>
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {state && (
        <>
          <form
            className="git-commit"
            onSubmit={(event) => {
              event.preventDefault()
              if (!busy && message.trim()) void run('commit', message)
            }}
          >
            <label htmlFor="git-message">Commit staged changes</label>
            <TextArea
              id="git-message"
              placeholder="Commit message"
              value={message}
              maxLength={8000}
              rows={3}
              disabled={busy}
              onChange={(event) => updateMessage(event.target.value)}
            />
            <Button
              type="submit"
              disabled={
                busy ||
                !message.trim() ||
                !state.files.some((file) => ![' ', '?'].includes(file.index))
              }
            >
              Commit
            </Button>
          </form>
          {!state.files.length && <p>Working tree clean.</p>}
          <section className="git-files" aria-label="Changed files">
            <p className="git-section-label">Changes · {state.files.length}</p>
            {state.files.map((file) => (
              <div className="git-file" key={file.path}>
                <Button
                  variant="row"
                  type="button"
                  disabled={busy}
                  aria-pressed={diff?.path === file.path}
                  title={file.path}
                  onClick={() => void preview(file)}
                >
                  <code>
                    {file.index}
                    {file.worktree}
                  </code>
                  <span>{file.path.split('/').at(-1)}</span>
                </Button>
                <IconButton
                  aria-label={`Stage ${file.path}`}
                  title="Stage"
                  disabled={
                    busy || (file.worktree === ' ' && file.index !== '?')
                  }
                  onClick={() => void run('stage', file.path)}
                >
                  <Plus size={14} />
                </IconButton>
                <IconButton
                  aria-label={`Unstage ${file.path}`}
                  title="Unstage"
                  disabled={busy || [' ', '?'].includes(file.index)}
                  onClick={() => void run('unstage', file.path)}
                >
                  <Minus size={14} />
                </IconButton>
              </div>
            ))}
          </section>
          {diff && (
            <section aria-label={`Diff for ${diff.path}`}>
              <pre className="git-diff">{diff.text}</pre>
            </section>
          )}
        </>
      )}
    </Panel>
  )
}
