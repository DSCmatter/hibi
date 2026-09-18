# Typst

Enable **Typst** under **Settings → Addons**. Run **New Typst document** from the command palette, or open a `.typ` file.

## Write and export

Source view provides syntax highlighting and formatting tools that insert Typst notation. Side-by-side view adds a live typeset preview. Typst has no visual editor, so Normal view is unavailable.

Use **Export PDF** above the preview, or run **Export Typst PDF** from the command palette. Syntax errors leave the source editable. No separate Typst installation is needed.

## Typst inside Markdown

Put Typst in a fenced code block:

````markdown
```typst
$ integral_0^1 x dif x = 1/2 $
```
````

Normal and side-by-side views render the block. Use its pencil button to edit it or its PDF button to export it. **Insert Typst block** is available in the command palette and slash menu.

Disabling Typst returns these blocks to ordinary code fences. Inline `$…$` math in Markdown belongs to the separate LaTeX plugin.

Documentation exports embed Typst previews as images for offline reading.

## Local files and limits

Compilation stays on your computer. Saved projects can use local imports, images, data, and fonts within the workspace or current file's folder. Hidden files, symbolic links, dependency/build folders, and files outside that root are excluded.

The compiler loads dependencies as needed; unrelated workspace files do not count toward the limits. A compile supports up to 1,000 dependency files, 64 MiB of input assets, and 64 rounds of dependency loading. It stops after 10 seconds. Output is limited to 200 pages, 20 MiB of preview images, or 64 MiB of PDF.

Automatic package downloads are disabled. Existing packages can be placed under Hibi's application-data `typst/packages` folder using Typst's namespace/name/version layout. Compiling never uploads your document.

The [addon page](../../src/addons/typst/README.md) includes credits and bundled font notices.
