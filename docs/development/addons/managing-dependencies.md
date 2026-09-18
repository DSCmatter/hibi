# Managing external dependencies

Declare external CLIs in your addon manifest. Hibi can show requirements before your addon loads, group identical tools across addons, and offer installation with native confirmation. Themes cannot declare executable dependencies.

```json
{
  "dependencies": [
    {
      "id": "pandoc",
      "name": "Pandoc",
      "command": "pandoc",
      "homepage": "https://pandoc.org/installing.html",
      "reason": "Convert notes to HTML. Requires Pandoc 3.11 or newer.",
      "install": {
        "brew": { "package": "pandoc" },
        "winget": "JohnMacFarlane.Pandoc"
      }
    }
  ]
}
```

`id` is local to your addon. Use the same ID, name, command, guide URL, and installer metadata when sharing a known tool with another addon. Different reasons and `optional` flags do not create separate tool entries. Set `optional: true` when a tool is only needed for a particular feature, such as running embedded code.

`command` is a filename, not a path or shell expression. Installation guides must use HTTPS. Homebrew supports a formula name or `{ "package": "quarto", "cask": true }`; WinGet uses an exact package ID from its `winget` source. Arbitrary installer scripts, shell commands, local formula files, and custom command arguments are not supported. Hibi limits declarations to 24 unique dependency IDs per addon.

## Check and offer installation

The [DependencyApi](../addon-api-reference/DependencyApi.md) is available as `context.dependencies` while the addon is enabled.

```typescript
async function showToolStatus(context) {
  const tool = await context.dependencies.check('pandoc')
  if (tool.status !== 'available') {
    context.dependencies.openSettings()
    return
  }
  context.notify(tool.version || 'Pandoc is available.')
}

function registerInstaller(context) {
  context.commands.register({
    id: 'install-pandoc',
    label: 'Install Pandoc…',
    run: async () => {
      await context.dependencies.install('pandoc')
    },
  })
}
```

`list()` returns the declared tools and their current availability. `check(id)` also probes `--version`, with bounded output and a timeout. Version output is descriptive; compare it yourself if your addon requires a particular version. Call checks when the user needs the feature, not on every keystroke or during unrelated editor startup.

`install(id)` always asks for native confirmation. It returns the refreshed state after installation or cancellation, and rejects if the installer fails or no supported package manager is available. `openSettings()` lets users choose a different executable or follow the installation guide. Calls through a stopped addon context are rejected, and an undeclared ID cannot be checked or installed.

## Native integrations

Bundled native modules use `await context.dependencies.resolve(id)` to obtain the selected executable, or `null` when it is missing. Invoke that path with an argument array and no shell. Never reconstruct a path from workspace content or fall back to running a same-named executable inside the workspace. Sideloaded addons cannot register native modules.

The manager validates declarations and resolves paths in the main process. Automatic discovery excludes the active workspace; user-picked paths are explicit overrides. Installers use only registered package-manager arguments, show their command before execution, and are bounded by a timeout. See [AddonDependency](../addon-api-reference/AddonDependency.md) and [DependencyState](../addon-api-reference/DependencyState.md) for the complete schema.

Installation IDs should come from the tool's official instructions, such as [Pandoc's installation guide](https://pandoc.org/installing.html), [Homebrew's Quarto cask](https://formulae.brew.sh/cask/quarto), and [WinGet's install reference](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).
