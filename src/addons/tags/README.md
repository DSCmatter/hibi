# Tags

Organize notes with `#tags`. Turn on **Tags** in **Settings → Addons**, then write tags in Markdown text. Names can contain letters from any language, numbers, underscores, hyphens, and nested paths such as `#work/project`. Matching ignores letter case; purely numeric tags are ignored.

Tags are highlighted in normal and source views. The plugin skips headings, escaped hashes, code, HTML, URLs, link labels, and frontmatter.

## Find notes by tag

Shift-click a tag, choose **Tags** from the sidebar view menu, or run **Browse tags** in the command palette. Filter the list, select a tag, then open a matching note. The browser stays beside the editor.

When the current note has tags, the status bar shows their count. Hover to see their names or click to open the browser. Tags update as you edit, when workspace files change, and when Hibi regains focus.

New drafts without a workspace path appear in the status count but not in workspace search results. The browser reads up to 2,000 documents totaling 20 MiB.

Tags stay as ordinary Markdown if you turn the plugin off or export a note. The plugin does not save an index or send note contents to a server.

## Credits

Hibi integration: may (Discord `1262793452236570667`).
