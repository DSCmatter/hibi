# Page properties with frontmatter

Frontmatter stores note properties as YAML at the start of a Markdown file. Hibi's Frontmatter plugin is enabled by default.

For example:

```yaml
---
title: Garden notes
published: false
tags:
  - plants
  - spring
---
```

## Add and edit properties

Run **Add frontmatter** from the command palette. With Slash commands enabled, you can also use `/frontmatter`, `/properties`, `/metadata`, or `/yaml`. These actions appear when the note has no existing properties.

Normal and side-by-side views show a collapsible properties panel above the document. Edit text, numbers, and booleans directly. Use **Add property** to choose a name and type, or remove a property from its row.

For lists, objects, or other YAML, open the YAML editor and choose **Apply YAML** when ready. Hibi checks the syntax before applying it. **Cancel** discards the YAML draft. If you change the source while that draft is open, reopen the YAML editor to load the latest values.

Choose whether properties start expanded under **Settings → Plugins → Frontmatter**.

## How your file is preserved

Editing the note's body leaves its frontmatter unchanged. Editing properties leaves the body unchanged. Property fields preserve comments, anchors, and value types, though they may reformat the YAML. Source view always shows the whole file.

Hibi recognizes a YAML mapping between an opening `---` and a closing `---` or `...`. An unfinished block or ordinary Markdown divider does not activate the plugin. Use `{}` for empty properties.

Disabling Frontmatter keeps the file intact. Notes with recognized frontmatter then use source editing to avoid losing metadata. Documentation exports retain the source metadata, but do not use its values to control search or navigation.
