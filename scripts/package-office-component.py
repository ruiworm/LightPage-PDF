"""Package an already prepared Windows Office runtime with stable ZIP metadata."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("office_root", type=Path)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    root = args.office_root.resolve(strict=True)
    if not (root / "program/soffice.com").is_file():
        parser.error("Expected a prepared LibreOffice runtime")
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    expanded_bytes = 0
    with ZipFile(args.archive, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_symlink() or not path.resolve().is_relative_to(root):
                raise ValueError(f"Unexpected link: {path}")
            if not path.is_file():
                continue
            info = ZipInfo(path.relative_to(root).as_posix(), (2026, 10, 20, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            data = path.read_bytes()
            expanded_bytes += len(data)
            archive.writestr(info, data, compresslevel=6)
    with args.archive.open("rb") as source:
        sha256 = hashlib.file_digest(source, "sha256").hexdigest()
    print(
        json.dumps(
            {
                "bytes": args.archive.stat().st_size,
                "expandedBytes": expanded_bytes,
                "sha256": sha256,
            }
        )
    )


if __name__ == "__main__":
    main()
