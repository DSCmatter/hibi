# Document formats

Enable format plugins under **Settings → Addons**. Enabled formats appear in **Formats**, **Syntax**, **Code highlighting**, and their plugin settings pages. Choose a format's Settings button to configure it. Markdown and plain text are always available.

## Supported formats

| Format | File extensions | Editing, preview, and export |
| --- | --- | --- |
| Markdown | `.md`, `.markdown` | Formatted editing, source, side-by-side view, HTML |
| Plain text | `.txt` | Source editing |
| MDX | `.mdx` | Preview without running code; Run document renders React; HTML export |
| LaTeX | `.tex` | Math-aware HTML preview; compile to PDF with Tectonic |
| reStructuredText | `.rst` | Preview and HTML export with Pandoc |
| AsciiDoc | `.adoc`, `.asciidoc` | Preview and HTML export with Pandoc |
| Org mode | `.org` | Preview and HTML export with Pandoc |
| Typst | `.typ` | Live typeset preview and PDF export |
| HTML | `.html`, `.htm` | Preview and HTML export with scripts removed |
| MediaWiki | `.wiki`, `.mediawiki` | Preview and HTML export with Pandoc |
| R Markdown | `.rmd` | Preview without running code; Run document uses R; HTML export |
| Quarto Markdown | `.qmd` | Preview without running code; Run document uses Quarto; HTML export |
| MDsveX | `.svx` | Preview without running code; Run document renders Svelte; HTML export |
| Markdoc | `.mdoc` | Preview and HTML export |
| Djot | `.dj` | Preview and HTML export with Pandoc |
| Textile | `.textile` | Preview and HTML export with Pandoc |
| Creole | `.creole` | Preview and HTML export with Pandoc |

## Views and formatting tools

Plain text uses Source view. Formats without a formatted editor offer source and side-by-side preview; their Normal view button is disabled. Hibi chooses an available view when you switch files. Disabling a format plugin leaves its source editable.

Toolbar tools insert the current format's notation for headings, emphasis, lists, links, images, code, and tables where supported. Unavailable actions are hidden. Changes support undo.

LaTeX link, image, and strikethrough tools add missing `hyperref`, `graphicx`, or `ulem` packages after a standard `\documentclass` declaration. A fragment without a preamble relies on its parent document to load those packages.

Run, compile, and export buttons stay at the top of the preview panel. Your current preview remains visible while an updated one renders. Previewing does not convert the saved source to Markdown.

## Install required tools

Some formats need tools installed separately. Use **Check tools** in the plugin's settings to check whether Hibi can find them.

| Format | Required tools |
| --- | --- |
| Pandoc-based formats | Pandoc 3.11 or later |
| LaTeX PDF export | Tectonic |
| R Markdown execution | R, the `rmarkdown` package, and its rendering dependencies |
| Quarto execution | Quarto and the document's R or Jupyter runtime |

Put these tools on your system's `PATH`. Hibi also checks common macOS package-manager locations. Typst, Markdoc, MDX, MDsveX, HTML previews, and inline LaTeX math work with tools included in Hibi.

## Run or compile a document

Regular previews leave embedded JavaScript, R, and Python code inactive. **Run document** asks for confirmation before running the current document and its project code. That code can access files and the network with your user permissions, so run only projects you trust.

Run results belong to the version you ran. Run again after editing to update them. You can export the result as HTML with scripts removed.

MDX and MDsveX runs can load local components and installed project packages. They render on the server side; browser-only APIs and interactive client behavior are unavailable in the preview.

**Compile document** uses Tectonic to build LaTeX PDFs. Shell escape is disabled. Saved files can use local includes and assets from their folder, and Tectonic may download required packages. Hibi displays the PDF locally and exports it unchanged. Inline math in Markdown uses the included offline KaTeX renderer.

Regular Pandoc previews restrict file access and do not follow project features that need to execute code. HTML previews remove scripts, forms, and document styles, then use Hibi's typography. Documentation exports use these restricted previews and never run project code automatically.

## Limits and errors

Most format previews accept up to 2 MiB of source, run for up to 15 seconds, and produce up to 20 MiB of HTML. Explicit runs have a 90-second limit. PDFs are limited to 64 MiB; previews show up to 200 pages, with up to 16 million pixels per rendered page.

Local images may be up to 8 MiB each, or 20 MiB total when embedded. If a preview fails, its error appears beside the source and you can continue editing.

Typst has its own [compiler limits](typst.md#local-files-and-limits).
