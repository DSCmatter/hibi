# Sideloading and sharing

Sideloading installs an addon without rebuilding Hibi. An extension package needs `hibi-addon.json`, `README.md`, and a compiled browser module.

## Make a package

Create a folder with this `hibi-addon.json`:

```json
{
  "id": "hello",
  "name": "Hello",
  "description": "A greeting from your first addon.",
  "version": "1.0.0",
  "apiVersion": 2,
  "kind": "extension",
  "authors": [{ "displayName": "Your name" }],
  "entry": "index.js"
}
```

Add an `index.js` that exports a factory. Hibi passes its [shared SDK](../addon-api-reference/SideloadFactory.md) to this factory.

```javascript
export default () => ({
  start(context) {
    context.commands.register({
      id: 'greet',
      label: 'Say hello',
      run: () => context.notify('Hello from your addon.'),
    })
  },
})
```

Add a readme that explains how to use the command. This example is already JavaScript and needs no build step. For TypeScript or JSX, compile your package before sharing it. Hibi does not run package installation or build scripts.

Use the factory's `React`, `ui`, `tiptap`, `codeMirror`, and `markdown` values instead of bundling second copies of those libraries. Relative imports may load other compiled files in your package. Do not import from Hibi's source tree in an installed package.

## Install it locally

Run **Install theme or extension…** from the command palette and choose the package folder. Review it, install it, then enable it in **Settings → Addons**. If you already have a source addon with the same ID, use a different ID for this package.

Installed extensions run trusted code with access to documents through the addon APIs. Install packages only from sources you trust. They cannot include native handlers; those must ship with Hibi.

## Share it

Publish the prepared files in a public HTTPS Git repository or ZIP archive. The manifest can sit at the archive root or inside one wrapping folder. Users can install that URL through **Settings → Addons → Install from URL**.

Git packages need their compiled entry committed on the default branch, and Git installed on the user's machine. Private repositories and SSH URLs are not supported. Keep packages under 25 MiB, with no more than 1,000 files and no individual file over 5 MiB. Do not include `node_modules`, secrets, or native executables.

To update a package, increase its version and install the replacement. Replacements start disabled so the user can review them before enabling them.
