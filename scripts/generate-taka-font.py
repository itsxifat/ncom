"""
Builds the taka sign (৳, U+09F3) NCOM writes money with.

Manrope, Space Grotesk, Geist Mono and most storefront faces carry no Bengali,
so on their own a "৳" falls through to whatever the device happens to have —
Nirmala UI on Windows, Noto Sans Bengali on Android, Kohinoor on a Mac — drawn
at a different height, weight and stroke from the figures beside it, and
different again on every phone. Even Bangla faces disagree: Hind Siliguri's
sign is a heavy closed knot, Baloo's a soft blob. A price is the most-read
thing on most screens here; its first character should look the same in the
dashboard, the builder and every shop, and belong with the figures after it.

The shape is Google Sans's taka — the one shoppers already saw on the first
stores to use Google Sans as their Bangla face, and the one the team picked
as the best of the lot: a clean monoline hook, stem and bowl, the bar sitting
at figure height, drawn by the same hand as Google Sans's Latin figures so
"৳1,500" reads as one word. (It replaced an earlier drawing based on a
Flaticon icon; that version needed a credit line wherever it appeared, this
one does not.)

Google Sans is published on Google Fonts under the SIL Open Font License 1.1,
which allows subsetting and embedding. The OFL asks that a modified font not
be distributed under the original's name, so each file is renamed "NCOM Taka";
its copyright and licence records are kept, as the licence requires.

The root layout loads the files with `unicode-range: U+09F3` ahead of every
text font (dashboard and storefront alike), which means the browser uses them
for that single character and nothing else.

Run from the repository root:

    python -m pip install fonttools brotli
    python scripts/generate-taka-font.py

Writes src/app/fonts/ncom-taka-{400,500,600,700}.woff2. Never edit the output;
regenerate it.
"""

import io
import re
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "app" / "fonts"
FAMILY = "Google Sans"
NAME = "NCOM Taka"
TAKA = 0x09F3
WEIGHTS = (400, 500, 600, 700)
# Google serves WOFF2 to a current browser and older formats to anything else.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

# Name records kept from the source: the copyright notice, the licence
# description and the licence URL. Everything naming the font is rewritten.
KEEP_NAME_IDS = {0, 13, 14}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def taka_only(weight: int) -> TTFont:
    """Google Sans at one weight, cut down by Google to just the taka sign."""
    query = urllib.parse.urlencode(
        {"family": f"{FAMILY}:wght@{weight}", "text": chr(TAKA)}
    )
    css = fetch(f"https://fonts.googleapis.com/css2?{query}").decode()
    match = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css)
    if not match:
        raise SystemExit(f"No font file in Google's answer for weight {weight}:\n{css}")
    font = TTFont(io.BytesIO(fetch(match.group(1))))
    if TAKA not in font.getBestCmap():
        raise SystemExit(f"Google's file for weight {weight} has no taka sign")
    return font


OFL_DESCRIPTION = (
    "This Font Software is licensed under the SIL Open Font License, Version 1.1. "
    "This license is available with a FAQ at: https://openfontlicense.org"
)


def rename(font: TTFont, weight: int) -> None:
    table = font["name"]
    # Google's single-character files keep the licence URL but drop the
    # licence description, so either one is accepted as the proof of OFL.
    licence = f"{table.getDebugName(13) or ''} {table.getDebugName(14) or ''}"
    if "Open Font License" not in licence and "openfontlicense.org" not in licence:
        raise SystemExit(f"Unexpected licence on {FAMILY}: {licence!r}")
    style = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}[weight]
    table.names = [record for record in table.names if record.nameID in KEEP_NAME_IDS]
    for name_id, value in (
        (13, OFL_DESCRIPTION),
        (14, "https://openfontlicense.org"),
        (1, NAME),
        (2, "Regular"),
        (3, f"{NAME} {style}"),
        (4, f"{NAME} {style}"),
        (6, f"NCOMTaka-{style}"),
        (16, NAME),
        (17, style),
    ):
        table.setName(value, name_id, 3, 1, 0x409)
    font["OS/2"].usWeightClass = weight


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        font = taka_only(weight)
        rename(font, weight)
        font.flavor = "woff2"
        out = OUT_DIR / f"ncom-taka-{weight}.woff2"
        font.save(out)
        print(f"{out.relative_to(OUT_DIR.parent.parent.parent)}  {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
