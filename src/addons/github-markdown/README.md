# GitHub Markdown

Add tables, task lists, strikethrough, automatic links, and alerts to Markdown. This plugin is on by default.

## Alerts

[GitHub alerts](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) support `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`:

```markdown
> [!WARNING]
> hello
```

In normal view, type `> `, then `[!WARNING]`, and press Enter. You can put paragraphs, lists, and code blocks inside an alert. Source view keeps the original Markdown; exported documents keep the alert's colors and styling. Unknown alert names appear as ordinary quotes.

## Choose features

**Settings → Syntax** has separate switches for tables, tasks, strikethrough, and alerts. Turn a feature off to show its Markdown characters as text. Turn it back on to restore the formatting.

Automatic syntax mode detects GitHub Markdown. To choose a different style for a file, use the syntax button in the status bar or the command palette. Features outside that style keep their source text; edit them in source view.

## Credits

Hibi integration: may. Uses MIT-licensed Tiptap and Marked, listed in Hibi's **Open source licenses**.
