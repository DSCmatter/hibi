# word count

enable **word count** in settings → addons. the status bar shows live word and character totals for the current document, including unsaved edits, paste, undo, and tab changes. disabled by default.

markdown counts use the rich editor's document text in every view: formatting markers and frontmatter properties do not count. other formats count their source text without running a compiler. characters include spaces and line breaks; unicode grapheme segmentation treats combining accents and joined emoji as single characters. word segmentation follows the runtime's language-aware word boundaries.

counting runs in a local worker, with only the latest pending edit retained. it never uploads or persists document text. disabling the plugin terminates the worker and removes its listeners and status item. uses the existing rich-editor, document-change, and status-bar APIs.
