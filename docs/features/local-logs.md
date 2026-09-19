# Local diagnostic reports

Hibi keeps a small set of local diagnostic files automatically. They can help identify application failures without recording your documents. Choose **Help → Open local logs** to find them, or **Help → Save diagnostic report…** to save a text report that you can inspect and share yourself. Hibi does not send these reports anywhere.

Reports contain Hibi's version, build and runtime versions, static failure descriptions, and process termination details when available. Some JavaScript failures include sanitized locations in Hibi's generated code. Reports exclude document text, filenames, filesystem paths, keystrokes, clipboard contents, arbitrary error messages, compiler output and memory dumps. Development and debug builds use the same privacy rules.

Logs live inside the active application profile. Release builds keep four log files of at most 1 MiB each; debug builds keep four of at most 2 MiB each. Each profile also has a bounded incident summary, replacement file and run marker. Older log segments are replaced automatically. Reports saved through the menu are separate copies that you manage yourself.

A report can be incomplete. Pending records may be lost when the app stops, and most native process failures have no JavaScript stack. An unconfirmed previous run means Hibi could not confirm a clean diagnostic shutdown; it does not identify the cause. Some failures cannot be observed safely. Unavailable logging does not change document saving or recovery.

The editor's recovery screen still offers **Save a copy** and **Reload Hibi**. Its existing **Error details** view is separate from the sanitized diagnostic report and may contain raw error details. Review anything you choose to copy from that view before sharing it.

For implementation and coverage details, see [local diagnostics development](../development/core/local-diagnostics.md).
