# LaTeX

Turn on **LaTeX** in **Settings → Addons** to write LaTeX documents and add equations to Markdown.

## LaTeX documents

Open a `.tex` file or choose **New LaTeX document**. You can edit the source or use side-by-side view to see a preview. Install Pandoc 3.11 or newer for automatic previews and HTML export. To create a PDF, install Tectonic, choose **Compile document**, and confirm. **Export PDF** saves the result.

Use **Check tools** in the plugin's settings to check your installation. The tools must be available on your system's `PATH`. Save files included by your document before compiling; Hibi uses the active note's unsaved text.

## Equations in Markdown

Write `$x^2$` for an inline equation or use `$$` delimiters for a block. You can also insert equations from the toolbar or command palette. Click a rendered equation to edit it.

Choose which math features to use in **Settings → Syntax**.

## Credits

This plugin uses MIT-licensed [Tiptap Mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics) and [KaTeX](https://katex.org/docs/security), listed in Hibi's **Open source licenses**.
