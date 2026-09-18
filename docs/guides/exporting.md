# Export documentation

The Documentation addon turns a folder of Markdown files into one HTML file. Readers can open it in a browser, search it, and follow its links without installing Hibi.

## Export a folder

1. Put your Markdown files in a folder. Nested folders are supported.
2. Open the folder as a workspace in Hibi.
3. Enable **Documentation** under **Settings → Addons**.
4. Run **Export documentation** from the command palette.
5. Choose where to save the `.html` file.

Open the result from disk, or upload it to a static website host, usually as `index.html`. The exported file works offline.

Review the folder before sharing it: the export includes every supported document it finds and the local images or videos those documents reference. Unsaved edits in the current workspace note are included without saving them to the original file.

## What readers get

The export includes a folder sidebar, page breadcrumbs, previous/next links, and a heading outline. The outline highlights the current section as the reader scrolls.

Press `Cmd/Ctrl+K` to search titles, paths, and document text. Search runs in the browser. Local links between included pages point to their exported copies. A root `README.md` or `index.md` becomes the starting page when present.

On a phone, the sidebar opens over the page. Selecting a page, tapping outside, or pressing Escape closes it. The heading outline becomes a menu above the document; wide tables and code blocks scroll within the page.

The appearance button offers nine built-in [colorschemes](colorschemes.md). Your selected appearance becomes the starting choice, but readers can save their own preference. Custom addon palettes fall back to Hibi's colors. Fonts and license notices are included in the file.

## Images and videos

Local attachments are embedded for offline viewing. Videos use the browser's playback controls. Relative media paths resolve from each note's folder; absolute paths and local `file:` URLs also work.

Supported image types are PNG, JPEG, GIF, WebP, AVIF, and SVG, up to 8 MiB each. Missing or unsupported images keep their description. Remote images are not downloaded. See [attachments](../editing/media-and-navigation.md#attachments) for video formats and path rules.

## Limits

An export supports up to 2,000 documents and 20 MiB total for source text and embedded media. Large videos may need to be shared separately. Hidden documents, symbolic links, and `node_modules` are excluded.

Exports are read-only. They remove scripts, forms, event handlers, and unsafe URLs from document HTML. They do not run project code or include addon code and custom CSS. Links to other local file types are disabled; explicit web and email links remain available.
