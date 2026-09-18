# Document formats

Enable format plugins under **Settings → Addons**, then open **Formats** to configure them. Markdown and plain text are always available.

## Supported formats

| Format | File extensions | Preview and export |
| --- | --- | --- |
| Markdown | `.md`, `.markdown` | Formatted editing, source, side-by-side view, HTML |
| Plain text | `.txt` | Source editing |
| MDX | `.mdx` | Preview, React rendering, HTML |
| LaTeX | `.tex` | Math-aware preview, PDF compilation |
| reStructuredText | `.rst` | Pandoc preview and HTML |
| AsciiDoc | `.adoc`, `.asciidoc` | Pandoc preview and HTML |
| Org mode | `.org` | Pandoc preview and HTML |
| Typst | `.typ` | Typeset preview and PDF |
| HTML | `.html`, `.htm` | Static preview and HTML |
| MediaWiki | `.wiki`, `.mediawiki` | Pandoc preview and HTML |
| R Markdown | `.rmd` | Preview, R rendering, HTML |
| Quarto Markdown | `.qmd` | Preview, Quarto rendering, HTML |
| MDsveX | `.svx` | Preview, Svelte rendering, HTML |
| Markdoc | `.mdoc` | Preview and HTML |
| Djot | `.dj` | Pandoc preview and HTML |
| Textile | `.textile` | Pandoc preview and HTML |
| Creole | `.creole` | Pandoc preview and HTML |

## Views and formatting tools

Plain text uses Source view. Formats without a visual editor offer source and side-by-side preview. The toolbar shows formatting tools supported by the current format, while run, compile, and export buttons appear above its preview.

## Install required tools

Some formats need tools installed separately. Use **Check tools** in the plugin's settings to check whether Hibi can find them.

| Format | Required tools |
| --- | --- |
| Pandoc-based formats | Pandoc 3.11 or later |
| LaTeX PDF export | Tectonic |
| R Markdown execution | R, the `rmarkdown` package, and its rendering dependencies |
| Quarto execution | Quarto and the document's R or Jupyter runtime |

These tools must be on your system's `PATH`, which tells apps where to find programs. Hibi includes the tools needed for Typst, Markdoc, MDX, MDsveX, HTML previews, and inline LaTeX math.

## Run or compile a document

Regular previews leave embedded code inactive. **Run document** asks for confirmation before running the document and its project code. That code can access your files and the network, so run only projects you trust. Run it again after editing to update the result.

MDX and MDsveX can use local components and installed packages, but their previews do not support browser-only APIs or client interactivity. Regular Pandoc previews restrict file access, and HTML previews remove scripts, forms, and document styles.

For LaTeX, **Compile document** creates a PDF using local includes and assets from the saved file's folder. It may download required packages. Shell commands are disabled during compilation. Inline math in Markdown works offline.

## Limits and errors

Try a smaller document or project if rendering reports a size or time limit. See [Typst](typst.md#local-files-and-limits) for its local-file requirements.
