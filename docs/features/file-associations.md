# Open files with Hibi

Hibi accepts local document files from the operating system, including Finder's
Open With menu, Dock drops, and Windows/Linux launch arguments. Requests received
while starting or performing another file operation wait until the editor is
ready. Opening an already-open file selects its tab. Single-file mode keeps its
normal save/discard/cancel prompt.

Unsupported formats and unreadable files show a notice. Opening a file never runs
its embedded code; executable formats retain their explicit Run action.
