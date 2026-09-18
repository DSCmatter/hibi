# Typst

Write and preview typeset documents without installing a separate Typst compiler. Turn on **Typst** in **Settings → Addons**, then open a `.typ` file or choose **New Typst document** from the command palette.

## Edit and export

Use source view for syntax highlighting and formatting tools, or side-by-side view for a live preview. Normal view is unavailable because Typst does not have a rich editor. Vim, line numbers, and Undo work in source view.

The preview updates after a short typing pause. Errors leave your source unchanged. Choose **Export PDF** above the preview or **Export Typst PDF** in the command palette to save the result.

Typst files work with the explorer, renaming, moving, saving, and local version history. Drop an image into the source pane to copy it into the workspace and insert a `#image(...)` reference. Turning the plugin off leaves source editing available.

## Typst inside Markdown

Choose **Insert Typst block** from the command palette or slash menu, or write a fenced block:

````markdown
```typst
$ sum_(k=1)^n k = (n(n+1))/2 $
```
````

Normal and side-by-side views show the rendered block. Click its pencil button to edit the source or its PDF button to export it. Markdown's inline `$…$` syntax belongs to the separate LaTeX plugin.

Turn off Typst blocks in **Settings → Syntax** to show their code fences as text. This leaves `.typ` previews and PDF export available. **Settings → Code highlighting** controls source colors separately.

Documentation exports include Typst documents and blocks as embedded SVG images. Readers need no compiler or network connection. PDF and SVG exports preserve the page layout.

## Local files and packages

The compiler reads files inside your workspace, or the current file's folder when no workspace is open. Imports are relative to the note. Hidden files, symbolic links, dependency folders, build folders, and files outside that root are excluded.

Only files requested by the document count toward the limits: 1,000 dependency files and 64 MiB of input assets. Compilation allows 64 rounds of dependency discovery and stops after 10 seconds. Output is limited to 200 pages, 20 MiB of SVG, and 64 MiB of PDF. Hibi stays available while compiling.

Automatic package downloads are blocked. To use cached packages, place them in `typst/packages` inside Hibi's application-data folder, following Typst's namespace/name/version folder layout. Compilation does not upload your document.

## Credits

- Hibi integration: may (Discord `1262793452236570667`).
- [Typst](https://github.com/typst/typst): the Typst project developers, Apache-2.0.
- [typst.ts](https://github.com/Myriad-Dreamin/typst.ts): Myriad-Dreamin and contributors, Apache-2.0.
- Bundled fonts and assets keep their [upstream notices](../../../docs/licenses/typst-assets.md), also in Hibi's **Open source licenses**.
