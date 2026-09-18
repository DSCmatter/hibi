import { createElement } from 'react'
import { FormatSettings, startFormat } from '../_shared/format-renderer'
import { formatSpec } from '../_shared/format-specs'
import { type DependencyApi, defineAddon } from '../api'
import manifest from './manifest'
import { PackageSettings } from './PackageSettings'
import { mathFlavor } from './syntax'

let dependencies: DependencyApi | undefined
export default defineAddon({
  manifest,
  flavors: [mathFlavor],
  Settings: () =>
    createElement(
      'div',
      null,
      createElement(FormatSettings, {
        spec: formatSpec(manifest),
        dependencies,
      }),
      createElement(PackageSettings),
    ),
  async start(context) {
    dependencies = context.dependencies
    startFormat(context, formatSpec(manifest))
    ;(await import('./engine')).startMath(context)
  },
  stop: () => {
    dependencies = undefined
  },
})
