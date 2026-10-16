#!/usr/bin/env bash
set -euo pipefail

bundle="$(cd "${1:-frontend/editor/src-tauri}" && pwd)"
work="$(mktemp -d)"
java="$bundle/runtime/jre/bin/java"
tools="$bundle/runtime/tools"
node_path="$(command -v node)"
export PATH="$tools/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export TESSDATA_PREFIX="$tools/tessdata"
port="$(/usr/bin/python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
jar_files=("$bundle"/libs/stirling-pdf-*.jar)
[[ ${#jar_files[@]} == 1 && -f "${jar_files[0]}" ]]
repo="$(pwd)"
(
  cd "$work"
  exec "$java" -Xmx1g -DBROWSER_OPEN=false -DSTIRLING_PDF_TAURI_MODE=true \
    -Dserver.address=127.0.0.1 "-Dserver.port=$port" \
    "-Dsystem.customPaths.operations.soffice=$tools/LibreOffice.app/Contents/MacOS/soffice" \
    -jar "${jar_files[0]}"
) > "$work/backend.log" 2>&1 &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true; cat "$work/backend.log"' EXIT
for attempt in {1..120}; do
  kill -0 "$backend_pid"
  if curl --fail --silent "http://127.0.0.1:$port/api/v1/info/status" | grep -q 'UP'; then
    "$node_path" --input-type=module - "http://127.0.0.1:$port" <<'NODE'
import assert from 'node:assert/strict';
const response = await fetch(`${process.argv[2]}/api/v1/ui-data/ocr-pdf`);
assert(response.ok, 'OCR language endpoint must be available');
const { languages } = await response.json();
for (const language of ['chi_sim', 'eng']) assert(languages.includes(language), `Missing OCR language: ${language}`);
NODE
    "$node_path" "$repo/scripts/smoke-document-tools.mjs" "http://127.0.0.1:$port"
    exit 0
  fi
  sleep 1
done
echo 'Bundled backend did not become healthy' >&2
exit 1
