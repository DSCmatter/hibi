# Export a workspace

Open a workspace and choose **Export workspace to HTML** from the command palette. The export dialog lets you change the site’s appearance and publishing options before choosing where to save it. Hibi remembers these settings for the workspace.

Review the folder before sharing it. The export includes its supported documents and local attachments, including unsaved edits in the current note.

## Choose an output

**Single HTML file** is on by default. Open the file from disk or upload it as `index.html`. Its pages use `#page=` links, and search engines see the starting page.

Turn off **Single HTML file** to use the experimental static-folder export. Each document gets a pre-rendered page with a URL such as `/development/README.md/`. Upload the whole folder to your website host. Links also work without the trailing slash on hosts that redirect directory URLs. The export includes separate JavaScript and CSS files, making it easier to edit after exporting.

Hibi creates a new folder for each static export. It does not replace previous exports. A root `README.md` or `index.md` becomes the starting page.

## Customize the site

Set the site title, logo, and favicon in the export dialog. Choose light and dark themes, or use **CSS overrides** to change styles. **Lock theme** hides the reader’s appearance picker and keeps your selected themes.

Enable the **Graph** addon before exporting to include the [note graph](../editing/graph-and-tags.md). You can turn **Include graph** off for an individual export.

## Search and sharing

Page titles come from document headings. **Automatic SEO** adds descriptions from opening paragraphs and structured data for search engines. To override a page’s title and description, add them to its frontmatter:

```yaml
---
title: Getting started
description: Set up your first Hibi workspace.
---
```

Set **Site URL** to the published address, including a path such as `https://example.com/docs/`. Static-folder exports use it for canonical links and a sitemap. **Social image URL** must point to a publicly hosted image. You can also set the author, language, and whether search engines may index the site.

## Password protection

Turn on **Require a password** to encrypt the exported content. Hibi remembers that protection is enabled but asks for the password each time you export. Readers can unlock the result locally or on an HTTPS website.

Protected exports use hash-based links and cannot be indexed. Their page names, content, attachments, and custom styles remain encrypted until the reader enters the password.
