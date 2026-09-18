# Addon dependencies

Open **Settings → Dependencies** to see the command-line tools requested by your installed addons. Each tool lists the addons that use it, why they need it, and whether those addons are enabled. Identical requirements share one entry.

## Check a tool

Hibi searches your system's `PATH` and common installation directories. **Available** means it found an executable. Choose **Check all** or a tool's check button to run its `--version` command and display the result. Compare that version with the addon's requirements; Hibi does not enforce version ranges. Windows command wrappers such as `quarto.cmd` are located without running a version probe.

Use the filter to find a tool or an addon. Requirements remain visible when an addon is disabled, so you can prepare its tools before enabling it. Bundled tools, such as Typst's compiler and inline Markdown math, do not need an external installation.

## Install a missing tool

When the addon supplies an installer and a supported package manager is available, choose **Install with Homebrew** on macOS or **Install with WinGet** on Windows. Hibi shows a native confirmation with the package-manager command before downloading or installing anything. Declining leaves your computer unchanged. Installations run one at a time.

**Installation guide** opens the tool's website. Use it on Linux, when your package manager needs setup or interactive approval, or when the addon does not supply an installer. Hibi does not install package managers, accept package agreements automatically, or uninstall system tools shared with other applications. Manage tool upgrades and removals through your package manager.

## Choose an existing installation

Choose **Choose executable…** to select a trusted executable, including a specific toolchain version. The path is saved for this Hibi profile and shared by addons with the same requirement. **Use PATH** removes that override. Managed paths take effect on the next command without restarting Hibi.

Automatic discovery excludes executables inside the open workspace, including symlink targets. A custom executable is an explicit choice to trust that file. If an installer succeeds but its location is not found, choose its executable or restart Hibi to pick up an updated system `PATH`.

Pandoc-based formats, LaTeX PDF compilation, R Markdown, Quarto, and Git use this manager. R packages and a Quarto document's R or Jupyter libraries still need their own setup; see [document formats](../editing/formats.md).
