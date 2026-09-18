# Frontmatter

Edit a note's properties, such as its title or date, above the document body. Properties are stored as YAML at the start of the Markdown file. This plugin is on by default.

## Add and edit properties

Choose **Add frontmatter** in the command palette, or type `/frontmatter` in the slash menu. `/properties`, `/metadata`, and `/yaml` find the same action. It creates empty properties without changing your note's body.

In normal view, expand the properties section to edit text, numbers, or checkboxes. Choose **Add property** to give a new property a name and type. Use a row's action to remove it.

Lists, nested values, and other complex properties open in the YAML editor. **Apply** checks the YAML before changing your note; **Cancel** leaves it untouched. Duplicate property names are rejected. If the note's metadata changes while you have a YAML draft open, cancel and reopen the editor before applying it.

Writing in the document body leaves the original metadata unchanged. Editing a property may adjust its YAML formatting, but preserves comments, nested values, and the body. Invalid YAML stays unchanged until you repair it in the YAML editor. Ordinary Markdown dividers and unfinished YAML blocks remain part of the body.

Choose whether properties start expanded in **Settings → Frontmatter**. Turning the plugin off removes the properties editor; you can still edit notes with metadata in source view.
