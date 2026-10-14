# Chinese editing fallback

`NotoSansSC-Regular.ttf` is the regular (weight 400) static instance of the
official Noto Sans SC variable TrueType font. It supplies Chinese glyphs when
a PDF's embedded subset cannot encode new input. The Latin Noto Sans fallback
remains available for its other language coverage.

Source: https://github.com/notofonts/noto-cjk/blob/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf

Source SHA-256: `d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964`

Bundled SHA-256: `fe68d27739949255fb5716a97966def4dcd72398026c1f828b0e0e26706dd802`

License: SIL Open Font License 1.1, included in `NotoSansSC-OFL.txt`.

To reproduce the static instance using FontTools:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont("NotoSansSC-VF.ttf")
instantiateVariableFont(font, {"wght": 400}, inplace=True, updateFontNames=True)
font.save("NotoSansSC-Regular.ttf")
```
