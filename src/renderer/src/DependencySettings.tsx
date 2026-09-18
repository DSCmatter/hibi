import { ExternalLink, Package, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Addon, AddonState } from '../../addons/api'
import type { DependencyState } from '../../shared/dependencies'
import { errorMessage } from '../../shared/errors'
import {
  Button,
  ControlRow,
  IconButton,
  Panel,
  PanelMessage,
  SettingRow,
} from '../../ui/Controls'
import { useDialogs } from '../../ui/DialogProvider'
import { DocumentNotice } from '../../ui/DocumentNotice'
import { SettingsFilter } from '../../ui/SettingsFilter'
import './dependencies.css'

export function DependencySettings({
  active,
  addons,
  states,
  openAddon,
}: {
  active: boolean
  addons: readonly Addon[]
  states: readonly AddonState[]
  openAddon: (id: string) => void
}) {
  const [tools, setTools] = useState<DependencyState[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const dialogs = useDialogs()
  // biome-ignore lint/correctness/useExhaustiveDependencies: addon state changes refresh the list of tool consumers.
  useEffect(() => {
    if (!active) return
    let current = true
    const refresh = () =>
      void window.hibi
        .getDependencies()
        .then((next) => {
          if (current) {
            setTools(next)
            setError('')
          }
        })
        .catch((error) => {
          if (current) setError(errorMessage(error))
        })
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.removeEventListener('focus', refresh)
    }
  }, [active, states])
  useEffect(() => {
    if (!active || !tools?.some((tool) => tool.status === 'installing')) return
    const timer = setInterval(
      () =>
        void window.hibi
          .getDependencies()
          .then(setTools)
          .catch((error) => setError(errorMessage(error))),
      2000,
    )
    return () => clearInterval(timer)
  }, [active, tools])
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await action()
      setTools(await window.hibi.getDependencies())
      setError('')
    } catch (error) {
      await dialogs.alert({
        title: 'Dependency action failed',
        description: errorMessage(error),
      })
    } finally {
      setBusy(null)
    }
  }
  const waiting =
    !!busy || !!tools?.some((tool) => tool.status === 'installing')
  const matches = (tool: DependencyState) =>
    `${tool.name} ${tool.command} ${tool.addons.map((addon) => `${addon.name} ${addon.reason}`).join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  return (
    <>
      <header className="dependency-intro">
        <h1>Dependencies</h1>
        <p className="plugin-description">
          Manage command-line tools used by your addons. Shared tools are listed
          once, including requirements from disabled addons.
        </p>
      </header>
      <SettingsFilter
        id="dependencies-filter"
        label="Filter dependencies"
        placeholder="Filter tools or addons…"
        value={query}
        onChange={setQuery}
      />
      <div className="settings-group">
        <SettingRow
          id="check-dependencies"
          label="Required tools"
          description={
            [
              ...new Set(
                addons.flatMap(
                  (addon) =>
                    addon.manifest.dependencies?.map((tool) => tool.name) ?? [],
                ),
              ),
            ].join(', ') || 'Check availability and installed versions.'
          }
        >
          <Button
            disabled={waiting || !tools?.length}
            onClick={() =>
              void run('all', async () => {
                for (const tool of tools ?? [])
                  await window.hibi.checkDependency(tool.key)
              })
            }
          >
            {busy === 'all' ? 'Checking…' : 'Check all'}
          </Button>
        </SettingRow>
      </div>
      {error && (
        <DocumentNotice
          variant="warning"
          title="Dependencies unavailable"
          message={error}
        />
      )}
      {!tools && !error && (
        <DocumentNotice title="Checking dependencies…" busy />
      )}
      {tools?.map((tool) => (
        <section
          className="settings-group dependency-group"
          key={tool.key}
          aria-label={tool.name}
          hidden={!matches(tool)}
        >
          <SettingRow
            id={`dependency-${tool.key}`}
            label={tool.name}
            description={
              <span data-verbatim="true">{tool.version || tool.command}</span>
            }
          >
            <span className="dependency-state" data-status={tool.status}>
              {tool.status === 'installing'
                ? 'Installing…'
                : tool.status === 'available'
                  ? 'Available'
                  : tool.status === 'error'
                    ? 'Needs attention'
                    : 'Not found'}
            </span>
            <IconButton
              aria-label={`Check ${tool.name}`}
              disabled={waiting}
              onClick={() =>
                void run(tool.key, () => window.hibi.checkDependency(tool.key))
              }
            >
              <RefreshCw size={15} />
            </IconButton>
          </SettingRow>
          <div className="dependency-details">
            <p className="dependency-path">
              <span data-verbatim={!!tool.path}>
                {tool.path || 'No executable found in PATH.'}
              </span>
              {tool.customPath && <span> · Custom path</span>}
            </p>
            <p className="dependency-purpose">{tool.addons[0]?.reason}</p>
            <ul
              className="dependency-addons"
              aria-label={`Addons using ${tool.name}`}
            >
              {tool.addons.map((addon) => (
                <li key={addon.id}>
                  <button
                    type="button"
                    className="dependency-addon-link"
                    onClick={() => openAddon(addon.id)}
                  >
                    {addon.name}
                  </button>
                  <span>
                    {addon.optional ? 'Optional' : 'Required'}
                    {!addon.enabled && ' · Addon disabled'}
                  </span>
                  {addon.reason !== tool.addons[0]?.reason && (
                    <p>{addon.reason}</p>
                  )}
                </li>
              ))}
            </ul>
            {tool.message && (
              <DocumentNotice
                variant="warning"
                title="Tool check failed"
                message={tool.message}
              />
            )}
            <ControlRow>
              {tool.status !== 'available' && tool.installer && (
                <Button
                  disabled={waiting}
                  title={tool.installer.command}
                  onClick={() =>
                    void run(tool.key, () =>
                      window.hibi.installDependency(tool.key),
                    )
                  }
                >
                  Install with {tool.installer.manager}
                </Button>
              )}
              <Button
                disabled={waiting}
                onClick={() =>
                  void run(tool.key, () =>
                    window.hibi.configureDependency(tool.key, 'choose'),
                  )
                }
              >
                Choose executable…
              </Button>
              {tool.customPath && (
                <Button
                  disabled={waiting}
                  onClick={() =>
                    void run(tool.key, () =>
                      window.hibi.configureDependency(tool.key, 'reset'),
                    )
                  }
                >
                  Use PATH
                </Button>
              )}
              <a
                href={tool.homepage}
                onClick={(event) => {
                  event.preventDefault()
                  void run(tool.key, () =>
                    window.hibi.openDependencyGuide(tool.key),
                  )
                }}
              >
                Installation guide <ExternalLink size={12} aria-hidden />
              </a>
            </ControlRow>
          </div>
        </section>
      ))}
      {tools && !tools.some(matches) && (
        <Panel>
          <PanelMessage
            icon={tools.length ? <Search size={32} /> : <Package size={32} />}
            title={
              tools.length
                ? 'No matching dependencies'
                : 'No addon dependencies'
            }
          >
            {tools.length
              ? 'Try another tool or addon name.'
              : 'Installed addons do not declare external tools.'}
          </PanelMessage>
        </Panel>
      )}
    </>
  )
}
