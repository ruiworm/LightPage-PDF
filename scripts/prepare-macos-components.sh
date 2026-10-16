#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || { echo 'macOS is required' >&2; exit 1; }
bundle="${1:-frontend/editor/src-tauri}"
tools="$bundle/runtime/tools"
component_lock="$(shasum -a 256 "$0" | cut -d ' ' -f 1)"
if [[ -f "$tools/components.lock" && "$(cat "$tools/components.lock")" == "$component_lock" &&
      -x "$tools/bin/tesseract" && -x "$tools/bin/pdftohtml" &&
      -x "$tools/LibreOffice.app/Contents/MacOS/soffice" && -f "$tools/tessdata/chi_sim.traineddata" ]]; then
  echo 'Bundled macOS document components are ready'
  exit 0
fi
if [[ -e "$tools/bin/tesseract" || -e "$tools/LibreOffice.app" ]]; then
  echo 'Use a fresh bundle directory when preparing macOS components' >&2
  exit 1
fi

brew install tesseract poppler dylibbundler
brew install --cask libreoffice
mkdir -p "$tools/bin" "$tools/lib" "$tools/tessdata" "$tools/notices"
cp -R /Applications/LibreOffice.app "$tools/LibreOffice.app"

fix_files=()
for command in tesseract pdftohtml pdftotext pdfinfo pdftoppm pdftocairo; do
  package=poppler
  [[ "$command" != tesseract ]] || package=tesseract
  cp -L "$(brew --prefix "$package")/bin/$command" "$tools/bin/$command"
  chmod u+w "$tools/bin/$command"
  fix_files+=(-x "$tools/bin/$command")
done
search_dirs=(-s "$(brew --prefix)/lib")
for package in $(brew deps --formula --recursive tesseract poppler) tesseract poppler; do
  search_dirs+=(-s "$(brew --prefix "$package")/lib")
done
# Homebrew libraries otherwise retain absolute paths to the build machine.
printf 'quit\n' | dylibbundler -b -cd -of "${fix_files[@]}" "${search_dirs[@]}" \
  -d "$tools/lib/" -p '@executable_path/../lib/'
for language in chi_sim eng osd; do
  curl --fail --location --retry 3 --connect-timeout 30 --max-time 300 \
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/$language.traineddata" \
    --output "$tools/tessdata/$language.traineddata"
done
(cd "$tools/tessdata" && shasum -a 256 --check <<'CHECKSUMS'
a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730  chi_sim.traineddata
7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2  eng.traineddata
9cf5d576fcc47564f11265841e5ca839001e7e6f38ff7f7aacf46d15a96b00ff  osd.traineddata
CHECKSUMS
)
cp "$(brew --prefix tesseract)/share/tessdata/pdf.ttf" "$tools/tessdata/"
brew info --json=v2 tesseract poppler libreoffice > "$tools/notices/components.json"
for package in $(brew deps --formula --recursive tesseract poppler) tesseract poppler; do
  prefix="$(brew --prefix "$package")"
  mkdir -p "$tools/notices/$package"
  find -H "$prefix" -maxdepth 1 -type f \( -iname 'LICENSE*' -o -iname 'COPYING*' \) \
    -exec cp {} "$tools/notices/$package/" \;
done
while IFS= read -r -d '' binary; do
  if otool -L "$binary" | tail -n +2 | grep -Eq '/(opt/homebrew|usr/local)/(Cellar|opt)/'; then
    echo "Non-portable dependency: $binary" >&2
    exit 1
  fi
done < <(find "$tools/bin" "$tools/lib" -type f -print0)
env PATH="$tools/bin:/usr/bin:/bin" TESSDATA_PREFIX="$tools/tessdata" "$tools/bin/tesseract" --list-langs
env PATH=/usr/bin:/bin "$tools/bin/pdftohtml" -v
"$tools/LibreOffice.app/Contents/MacOS/soffice" --headless --version
printf '%s\n' "$component_lock" > "$tools/components.lock"
