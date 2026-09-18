# Translating Hibi

`en.json` is the English text catalog. `sources.json` lists the source files for each message. The message IDs stay the same until the English text changes.

Edit English copy in its source file, then run `npm run copy:catalog`. Run `npm run copy:check` to check that the catalog is current. Keep placeholders such as `{name}` in translations.

The catalog covers labels, help text, notices, and errors that can be read directly from the source. Text assembled from several variables needs a manual review before translation. Some help text contains syntax examples: keep their code and punctuation unchanged. User documents, filenames, and license terms are not collected.

Hibi currently displays English. This catalog prepares the copy for translation; it does not add a language picker or change the app's language. Translations need a shared language setting for the desktop app, plugins, and exported sites before they can be used.
