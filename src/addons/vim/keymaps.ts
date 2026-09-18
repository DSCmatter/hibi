import { Vim } from '@replit/codemirror-vim'
import type { AddonContext } from '../api'
import type { VimConfig, VimMapping } from './config'
import { vimPreferences } from './preferences'

let generation = 0
let imported: VimMapping[] = []

export function clearConfigMappings() {
  generation++
  for (const mapping of imported.toReversed())
    Vim.unmap(mapping.lhs, mapping.mode)
  imported = []
}

export async function loadConfigMappings(context: AddonContext) {
  if (!vimPreferences().config) {
    clearConfigMappings()
    return
  }
  const current = ++generation
  try {
    const config = await context.native.query<VimConfig>('config')
    if (current !== generation || !vimPreferences().config) return
    clearConfigMappings()
    for (const mapping of config.mappings) {
      if (mapping.recursive) Vim.map(mapping.lhs, mapping.rhs, mapping.mode)
      else Vim.noremap(mapping.lhs, mapping.rhs, mapping.mode)
      imported.push(mapping)
    }
  } catch (error) {
    if (current === generation)
      context.notify(
        error instanceof Error ? error.message : 'Could not read Vim config.',
      )
  }
}
