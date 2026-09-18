import {
  DEFAULT_APPLICATION_ID,
  type Preferences,
  parsePreferences,
} from './types'

export { validApplicationId } from './types'
export const settingsEvent = 'hibi:discord-presence-settings'

export function getPreferences(): Preferences {
  try {
    return parsePreferences(
      JSON.parse(
        localStorage.getItem('discord-presence:preferences') ?? 'null',
      ),
    )
  } catch {
    return {
      applicationId: DEFAULT_APPLICATION_ID,
      showDocumentName: false,
      showElapsed: true,
    }
  }
}

export function setPreferences(changes: Partial<Preferences>) {
  const next = parsePreferences({ ...getPreferences(), ...changes })
  localStorage.setItem('discord-presence:preferences', JSON.stringify(next))
  window.dispatchEvent(new Event(settingsEvent))
  return next
}
