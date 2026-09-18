# Documentation

Turn a Markdown workspace into a searchable website saved as one HTML file. The file works offline and can be shared or published on a web host.

1. Turn on **Documentation** in **Settings → Addons** and open a workspace.
2. Choose **Export documentation** from the command palette.
3. Choose where to save the HTML file.

The export includes unsaved edits to your current workspace note without saving them back to the source file. If you edit while an export is rendering, export again to include the latest changes.

## What readers get

The site includes folder navigation, breadcrumbs, previous and next pages, a heading outline, and search with Cmd/Ctrl+K. On small screens, navigation opens as a drawer and the heading outline folds away.

Your enabled Markdown features, including math and plugin-provided code highlighting, appear in the export. Per-file syntax choices are preserved. Styles, fonts, highlighted code, and required licenses are included, so readers do not need Hibi or a network connection.

Local PNG, JPEG, GIF, WebP, AVIF, and SVG images are embedded. Each image can be up to 8 MiB; Markdown and images together can total 20 MiB. Remote images and other attachments are not copied.

The site includes nine bundled color schemes and your appearance preferences. Readers can change appearance with the palette button. Custom plugin palettes fall back to Hibi's colors; plugin code and custom CSS are not exported.

See [Exporting](../../../docs/guides/exporting.md) for more options.

## Credits

Uses Hibi's shared navigation and search interface, DOMPurify, MiniSearch, and locally bundled Geist. Third-party theme licenses are included in the export.
