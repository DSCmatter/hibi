import { Activity } from 'lucide-react'
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { errorMessage } from '../../shared/errors'
import { performanceDiagnostics } from '../../ui/diagnostics'
import { Button, ControlRow, DocumentNotice, Panel, PanelMessage } from '../ui'
import type { NativeDiagnostics } from './types'
import './style.css'

const ms = (value: number | null) =>
  value === null ? '—' : `${value.toFixed(1)} ms`
const mib = (value: number | undefined) =>
  value === undefined ? '—' : `${value.toFixed(1)} MiB`

function MetricsTable({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable table region must be reachable by keyboard.
    <section className="diagnostics-table" aria-label={label} tabIndex={0}>
      {children}
    </section>
  )
}

export function Settings() {
  const data = useSyncExternalStore(
    performanceDiagnostics.subscribe,
    performanceDiagnostics.snapshot,
  )
  const [native, setNative] = useState<NativeDiagnostics | null>(null)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (stopped) return
      if (!root.current?.closest('[hidden]')) {
        try {
          const next = (await window.hibi.queryAddon(
            'diagnostics',
            'snapshot',
          )) as NativeDiagnostics
          if (!stopped) {
            setNative(next)
            setError('')
          }
        } catch (error) {
          if (!stopped) setError(errorMessage(error))
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])
  const names = new Map(
    data.initializations.map((entry) => [entry.id, entry.name]),
  )
  const ownerName = (owner: string) =>
    owner === 'core'
      ? 'Core'
      : owner === 'format'
        ? 'Formatting'
        : (names.get(owner) ?? owner)
  const checkpoints = performance
    .getEntriesByType('mark')
    .filter((entry) => entry.name.startsWith('hibi:'))
  return (
    <div className="diagnostics" ref={root}>
      <ControlRow>
        <span className="diagnostics-state">
          <span data-recording={data.enabled} />
          {data.enabled ? 'Recording' : 'Starting diagnostics…'}
        </span>
        <Button
          onClick={() => {
            performanceDiagnostics.clear()
            void window.hibi
              .queryAddon('diagnostics', 'clear')
              .catch((error) => setError(errorMessage(error)))
          }}
        >
          Clear runtime samples
        </Button>
      </ControlRow>
      {error && (
        <DocumentNotice title="Diagnostics unavailable" message={error} />
      )}
      <h2>Overview</h2>
      <dl className="diagnostics-summary settings-group">
        <div>
          <dt>Long tasks · 50 ms+</dt>
          <dd>{data.longTasksSupported ? data.longTasks : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Frame gaps · 50 ms+</dt>
          <dd>{data.frameGaps}</dd>
        </div>
        <div>
          <dt>Main loop delay · p95</dt>
          <dd>{ms(native?.eventLoopP95 ?? null)}</dd>
        </div>
        <div>
          <dt>Main loop delay · max</dt>
          <dd>{ms(native?.eventLoopMax ?? null)}</dd>
        </div>
        <div>
          <dt>Main loop utilization</dt>
          <dd>
            {native?.eventLoopUtilization == null
              ? '—'
              : `${(native.eventLoopUtilization * 100).toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt>Main JavaScript heap</dt>
          <dd>{mib(native?.mainHeapMiB)}</dd>
        </div>
      </dl>
      <h2>Addon initialization</h2>
      <p className="ui-description">
        Latest initialization in this window. Total time includes loading and
        starting the addon.
      </p>
      <MetricsTable label="Addon initialization">
        <table>
          <thead>
            <tr>
              <th>Addon</th>
              <th>Total</th>
              <th>Load</th>
              <th>Start</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.initializations.map((entry) => (
              <tr key={entry.id} data-addon={entry.id}>
                <th scope="row">{entry.name}</th>
                <td data-slow={entry.duration >= 100}>{ms(entry.duration)}</td>
                <td>{ms(entry.load)}</td>
                <td>{ms(entry.start)}</td>
                <td data-failed={entry.status === 'failed'}>
                  {entry.status === 'failed'
                    ? 'Failed'
                    : entry.status === 'cancelled'
                      ? 'Cancelled'
                      : 'Completed'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MetricsTable>
      <h2>Measured activity</h2>
      <p className="ui-description">
        Slowest callbacks first. Async time includes waiting; it does not
        measure blocked UI time.
      </p>
      {data.activity.length ? (
        <MetricsTable label="Measured activity">
          <table>
            <thead>
              <tr>
                <th>Owner / operation</th>
                <th>Calls</th>
                <th>Average</th>
                <th>Total</th>
                <th>p95</th>
                <th>Max</th>
                <th>Failures</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((entry) => (
                <tr key={`${entry.owner}:${entry.operation}:${entry.kind}`}>
                  <th scope="row">
                    {ownerName(entry.owner)}
                    <small>
                      {entry.operation}
                      {entry.kind === 'async' ? ' · async' : ''}
                    </small>
                  </th>
                  <td>{entry.count}</td>
                  <td>{ms(entry.total / entry.count)}</td>
                  <td>{ms(entry.total)}</td>
                  <td>{ms(entry.p95)}</td>
                  <td data-slow={entry.kind === 'sync' && entry.max >= 16}>
                    {ms(entry.max)}
                  </td>
                  <td>{entry.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MetricsTable>
      ) : (
        <Panel>
          <PanelMessage
            icon={<Activity size={28} />}
            title="No activity recorded"
          />
        </Panel>
      )}
      <h2>Recent stalls</h2>
      <p className="ui-description">
        Matching callbacks overlapped the stall; this does not prove they caused
        it.
      </p>
      {data.stalls.length ? (
        <MetricsTable label="Recent stalls">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Duration</th>
                <th>Observed callbacks</th>
              </tr>
            </thead>
            <tbody>
              {[...data.stalls].reverse().map((entry) => (
                <tr key={`${entry.start}:${entry.kind}`}>
                  <th scope="row">
                    {entry.kind === 'long-task' ? 'Long task' : 'Frame gap'}
                    <small>{(entry.start / 1000).toFixed(1)} s</small>
                  </th>
                  <td>{ms(entry.duration)}</td>
                  <td className="diagnostics-detail">
                    {entry.callbacks.length
                      ? entry.callbacks.join(', ')
                      : 'Unattributed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </MetricsTable>
      ) : (
        <Panel>
          <PanelMessage
            icon={<Activity size={28} />}
            title="No stalls recorded"
          />
        </Panel>
      )}
      <h2>Processes</h2>
      {native && (
        <MetricsTable label="Processes">
          <table>
            <thead>
              <tr>
                <th>Process</th>
                <th>PID</th>
                <th>CPU</th>
                <th>Memory</th>
              </tr>
            </thead>
            <tbody>
              {native.processes.map((entry) => (
                <tr key={`${entry.pid}:${entry.created}`}>
                  <th scope="row">{entry.type}</th>
                  <td>{entry.pid}</td>
                  <td>
                    {entry.cpu === null ? '—' : `${entry.cpu.toFixed(1)}%`}
                  </td>
                  <td>{mib(entry.memoryMiB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MetricsTable>
      )}
      <details>
        <summary>Startup checkpoints</summary>
        <p className="ui-description">Offsets use each process’s own clock.</p>
        <MetricsTable label="Startup checkpoints">
          <table>
            <thead>
              <tr>
                <th>Process / stage</th>
                <th>Offset</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((entry) => (
                <tr key={entry.name}>
                  <th scope="row">Renderer · {entry.name.slice(5)}</th>
                  <td>{ms(entry.startTime)}</td>
                  <td>—</td>
                </tr>
              ))}
              {native?.startup.map((entry) => (
                <tr key={`${entry.name}:${entry.kind}`}>
                  <th scope="row">Main · {entry.name}</th>
                  <td>{ms(entry.offset)}</td>
                  <td>{entry.kind === 'measure' ? ms(entry.duration) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MetricsTable>
      </details>
      {native && (
        <details>
          <summary>Runtime</summary>
          <dl className="diagnostics-summary settings-group">
            <div>
              <dt>Hibi</dt>
              <dd>{native.app.version}</dd>
            </div>
            <div>
              <dt>Electron</dt>
              <dd>{native.app.electron}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{native.app.chromium}</dd>
            </div>
            <div>
              <dt>Node.js</dt>
              <dd>{native.app.node}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>
                {native.app.platform} · {native.app.arch}
              </dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{native.app.development ? 'Development' : 'Production'}</dd>
            </div>
            <div>
              <dt>Process uptime</dt>
              <dd>{Math.floor(native.uptime)} s</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  )
}
