"""Create the Windows client using LibreOffice's loader, which sets the UNO environment."""

from pathlib import Path
import sys
import sysconfig

from pip._vendor.distlib.scripts import ScriptMaker


def main() -> None:
    loader = Path(sys.argv[1]).resolve()
    if not loader.is_file():
        raise FileNotFoundError(loader)
    maker = ScriptMaker(None, sysconfig.get_path("scripts"))
    # LibreOffice's loader reports a directory as sys.executable on Windows.
    maker.executable = str(loader)
    maker.variants = {""}
    maker.clobber = True
    maker.make("unoconvert = unoserver.client:converter_main")


if __name__ == "__main__":
    main()
