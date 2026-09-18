# LaTeX

Write LaTeX documents and add equations to Markdown. Turn on **LaTeX** in **Settings → Addons** or the command palette.

## LaTeX documents

Open a `.tex` file or choose **New LaTeX document**. Source and side-by-side views provide LaTeX highlighting and formatting tools.

Install Pandoc 3.11 or newer for the automatic preview and HTML export. To create a PDF, install Tectonic, then choose **Compile document** and confirm. **Export PDF** saves that compilation result. Both buttons stay above the preview while you scroll.

These tools must be available on your system's `PATH`. Use **Check tools** in the plugin's settings to check your installation. Compilation includes local files from a saved document's folder. Save any included files first; Hibi uses the active note's unsaved text as it is.

Turning the plugin off leaves source editing available.

## Equations in Markdown

Write `$x^2$` for inline math or use `$$` delimiters for a block. Code spans and code fences stay literal. Hibi can detect math automatically; the syntax button in the status bar lets you choose a style for the file.

Click a rendered equation to edit it in a dialog. The toolbar and command palette also offer inline and block insertion in normal and source views. Invalid equations show their source so you can fix them.

**Settings → Syntax** has separate switches for inline and block math. Turning one off shows its LaTeX delimiters as text in the editor and exports.

Markdown equations render locally with KaTeX and its math fonts. Exports include the equations, accessible MathML, styles, fonts, and license notices; they work offline.

## Credits

Uses MIT-licensed [Tiptap Mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics) and [KaTeX](https://katex.org/docs/security), listed in Hibi's **Open source licenses**.
