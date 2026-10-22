"""Regenerate the committed PDF base fonts: python -m pip install fonttools; python scripts/subset-fonts.py.
CI uses the committed files and does not need Python/fonttools. Keep FONT-LICENSE.txt with both subsets.
"""
from pathlib import Path
from fontTools import subset

characters = 'U+0000-024F,U+0300-036F,U+0400-052F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2116,U+2122,U+2212,U+FFFD'
root = Path(__file__).resolve().parent.parent / 'src' / 'assets'
for face in ['', '-Bold']:
    subset.main([str(root / f'DejaVuSans{face}.ttf'), f'--output-file={root / f"DejaVuSans{face}-Base.ttf"}', f'--unicodes={characters}', '--layout-features=*', '--notdef-glyph', '--notdef-outline', '--recommended-glyphs'])
