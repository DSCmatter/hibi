/** Saved preferences take precedence; only live development sessions opt into diagnostics. */
export function addonDefaultEnabled(
  id: string,
  defaultEnabled: boolean | undefined,
  development: boolean,
) {
  return (
    id === 'markdown' ||
    (id === 'diagnostics' ? development : (defaultEnabled ?? false))
  )
}
