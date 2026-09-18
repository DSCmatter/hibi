# Document formats and syntax

Register a [DocumentFormat](../addon-api-reference/DocumentFormat.md) to add a file format. Declare its extensions in the manifest's `fileExtensions` as well, without leading dots. Hibi uses the manifest to recognize files before the addon loads.

## Choose the supported views

Every format supports source view, called `markdown` in the API. Include `side-by-side` in `views` when your format has a useful preview. Include `normal` only when it has an editable visual view. Set `editing: 'markdown'` only for formats that can use Hibi's Markdown editor without losing content.

The `Preview` component receives the source in `value` and the current document in `document`. Its `toolbar` prop is the host's pinned action area. Render shared [PreviewActions](../addon-api-reference/PreviewActions.md) into that target for compile, run, or export buttons.

## Connect formatting and highlighting

Set `formatting: 'markdown'` for Markdown-compatible formats. Otherwise, provide [DocumentFormatting](../addon-api-reference/DocumentFormatting.md): an action list and an `apply` function that returns a source edit. Returning `null` leaves the selection unchanged. This connects the shared toolbar and shortcuts to your format.

Register a [CodeLanguage](../addon-api-reference/CodeLanguage.md) for syntax highlighting and put its ID in the format's `codeLanguage`. Register format-specific rendering options through `registerDocumentSyntax()`. These entries appear while the addon is enabled.

Use `load` to import a parser when it is first needed. Existing registrations with a `language` object remain supported. A format can omit its own `language` when it uses `codeLanguage`, or when its source is plain text.

```typescript
context.editor.registerCodeLanguage({
  id: 'javascript',
  aliases: ['js'],
  load: () => import('@codemirror/lang-javascript').then(module => module.javascript().language),
})
```

Hibi shares an in-flight load across aliases. Disabling or removing an addon while its parser loads cannot restore that registration after it finishes.

## Support export

Implement `render(source, documentId)` to return `{ html, css }` for workspace export. Keep rendering separate from editing: a preview or export must not rewrite the source. Hibi sanitizes the resulting HTML before displaying the exported site.

Formats that execute document code need an explicit run action. Do not execute it when the document opens or when a preview refreshes. Native compilers belong in a bundled addon's native entry point.

## Extend Markdown

Use [MarkdownFlavor](../addon-api-reference/MarkdownFlavor.md) for a Markdown dialect or syntax extension, and [MarkdownSyntaxFeature](../addon-api-reference/MarkdownSyntaxFeature.md) for its settings toggle. Keep disabled syntax editable as source. Use a [MarkdownExtension](../addon-api-reference/MarkdownExtension.md) for a reversible source-to-body projection, such as frontmatter above the visual editor.

The Markdown, frontmatter, and Typst addons in `src/addons/` provide working examples. Disabling a format must never delete or rewrite its documents.

For an unchanged contiguous body, a `MarkdownProjection` can declare `sourceOffset`: its exact UTF-16 start in the input. Hibi validates and composes these offsets before allowing rich-text edits. Omit it for transformed or generated content; those projections remain readable but cannot receive exact rich-text fixes.

### Serialization caching

Set `serialization: 'block-local'` only when each top-level block can serialize independently and the document joins those blocks with two newlines. Hibi caches by immutable block, its index, the previous block, and document attributes. A serializer must not depend on other blocks, mutable external state, or a custom document-level join. Leave this property out to use full-document serialization.

Hibi primes the cache before editing and reuses unchanged blocks during typing. Structural edits may invalidate more blocks. Test cached output against the full Markdown manager across edits, mark boundaries, empty paragraphs, and custom nodes before opting in.
