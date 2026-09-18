export type Preferences = {
  applicationId: string
  showDocumentName: boolean
  showElapsed: boolean
}
export const DEFAULT_APPLICATION_ID = '1550610632137637958'
export type PresenceStatus = {
  state:
    | 'unconfigured'
    | 'connecting'
    | 'connected'
    | 'waiting'
    | 'error'
    | 'stopped'
  message: string
}
export const validApplicationId = (value: string) => /^\d{17,20}$/.test(value)

export function parsePreferences(value: unknown): Preferences {
  const input = value as Partial<Preferences> | null
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.applicationId !== 'string' ||
    (input.applicationId !== '' && !validApplicationId(input.applicationId)) ||
    typeof input.showDocumentName !== 'boolean' ||
    typeof input.showElapsed !== 'boolean'
  )
    throw new Error(
      'Enter a valid Discord application ID. Bot tokens are not used.',
    )
  return {
    applicationId: input.applicationId,
    showDocumentName: input.showDocumentName,
    showElapsed: input.showElapsed,
  }
}
