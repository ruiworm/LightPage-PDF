from __future__ import annotations

import json
from urllib.parse import urlencode
from urllib.request import urlopen

from stirling.redaction.recognizer import MODEL_ID, MODEL_ROOT

FILES = ("config.json", "configuration.json", "tokenizer_config.json", "vocab.txt", "pytorch_model.bin")


def download_model() -> None:
    """Explicit setup step; downloads weights, never document contents."""
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = MODEL_ROOT / name
        if target.is_file():
            continue
        query = urlencode({"Revision": "master", "FilePath": name})
        temporary = target.with_suffix(target.suffix + ".download")
        with urlopen(f"https://modelscope.cn/api/v1/models/{MODEL_ID}/repo?{query}", timeout=60) as response:
            total = int(response.headers.get("Content-Length", 0))
            received = 0
            with temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    received += len(chunk)
                    if received % (32 * 1024 * 1024) == 0:
                        print(f"{name}: {received // (1024 * 1024)} MB", flush=True)
            if total and received != total:
                raise OSError("MODEL_DOWNLOAD_INCOMPLETE")
        temporary.replace(target)
        print(f"Installed {name}", flush=True)
    configuration = json.loads((MODEL_ROOT / "configuration.json").read_text(encoding="utf-8"))
    if configuration.get("task") != "named-entity-recognition":
        raise ValueError("UNEXPECTED_MODEL_CONFIGURATION")


if __name__ == "__main__":
    download_model()
