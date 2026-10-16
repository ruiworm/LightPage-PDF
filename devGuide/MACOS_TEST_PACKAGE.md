# macOS test packages

Run the **macOS test package** workflow in GitHub Actions on the desired commit.
It builds separate Apple Silicon (`arm64`) and Intel (`x64`) packages on matching
macOS 15 runners. Each artifact contains a DMG, a ZIP preserving the application
bundle's permissions, and SHA-256 checksums. These test packages require macOS 15
or later.

The application includes its own Java 25 runtime, LibreOffice, Tesseract with
Chinese and English recognition data, and Poppler. Homebrew is used only on the
build runner. The preparation script bundles the tools' shared libraries and
rewrites their library paths; users do not need Homebrew. Component versions and
available license files are included in `runtime/tools/notices`.

CI checks native tests, desktop types, and actual Word/Excel conversion, PDF to
Word, rotation, and OCR operations. It repeats the operation checks against the
finished application's resources with a PATH that excludes Homebrew, and verifies
the application signature before uploading artifacts.

These packages use an ad hoc signature. They are not signed with an Apple
Developer ID or notarized by Apple. A public release needs the owner's Apple
Developer signing identity and notarization credentials configured separately.

Packaging references: [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
and [dylibbundler options](https://github.com/auriamg/macdylibbundler#using-dylibbundler-on-the-terminal).
