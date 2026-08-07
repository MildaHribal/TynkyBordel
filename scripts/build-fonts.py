#!/usr/bin/env python3
"""
Build the self-hosted, Czech-subset webfonts for the storefront.

Why this exists instead of @nuxt/fonts
--------------------------------------
@nuxt/fonts pulled 7 families from Google, emitted BOTH .woff2 and legacy .woff
(2.1 MB in `_fonts`), and — worse — injected 151 `@font-face` rules into the
critical CSS. With `inlineStyles` those rules were duplicated across every
component chunk and inlined into the <head> of every SSR response: 93 KB of
render-blocking CSS before a single pixel was painted.

This script instead produces exactly three families, each as ONE file:

    Bricolage Grotesque   display / headings   variable wght 600-800
    Manrope               body / UI            variable wght 400-800
    Space Mono            prices / labels      static 400 + 700

Each is sliced (unused variable axes pinned to their default) and subsetted to
the Czech charset, so the whole typographic system costs less than one of the
old font files. The generated `assets/css/fonts.css` holds ~5 `@font-face`
rules plus metric-matched fallbacks so swapping in the webfont causes no layout
shift.

Output is committed to the repo — the production Docker build has no Python, so
subsetting happens here, at authoring time, not during deploy.

Requirements:  pip install "fonttools[woff]" brotli
Usage:         python3 scripts/build-fonts.py
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "scripts" / ".fonts-src"          # gitignored download cache
OUT_DIR = ROOT / "public" / "fonts"
CSS_OUT = ROOT / "assets" / "css" / "fonts.css"
MANIFEST = OUT_DIR / "manifest.json"

GF_RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# ── Charset ───────────────────────────────────────────────────────────────────
# Basic Latin + Latin-1 + the whole of Latin Extended-A. Extended-A is what
# carries the Czech carons and rings (č ď ě ň ř š ť ů ž) and it also covers
# Slovak/Polish/Hungarian, so a product title pasted from anywhere in Central
# Europe still renders from the webfont rather than falling back mid-word.
# The trailing ranges are the punctuation and symbols the design actually uses:
# en/em dashes, Czech „quotes", ellipsis, €, arrows, check mark, bullet, stars.
UNICODES = ",".join([
    "U+0020-007E", "U+00A0-00FF", "U+0100-017F", "U+02C6-02DC",
    "U+2010-2015", "U+2018-201E", "U+2020-2022", "U+2026", "U+2030",
    "U+2039-203A", "U+2044", "U+20AC", "U+2122", "U+2190-2193",
    "U+2212", "U+2713", "U+25CF", "U+2605-2606",
])

# Keep only the OpenType features that affect rendering here. Dropping the rest
# (small caps, swashes, alternate figure sets we never call for) trims the GSUB
# table, which is a surprisingly large share of a subsetted font.
LAYOUT_FEATURES = "kern,liga,clig,calt,ccmp,locl,mark,mkmk,rlig,tnum"

# ── The three families ────────────────────────────────────────────────────────
# `instance` pins variable axes we don't animate. Bricolage ships opsz+wdth+wght;
# pinning opsz=96 and wdth=100 (both are the font's own defaults, i.e. exactly
# what Google's static instances rendered as) takes it from 143 KB to 38 KB.
FAMILIES = [
    {
        "id": "bricolage",
        "family": "Bricolage Grotesque",
        "url": f"{GF_RAW}/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf",
        "src": "BricolageGrotesque[opsz,wdth,wght].ttf",
        "instance": ["wdth=100", "opsz=96", "wght=600:800"],
        "weight": "600 800",
        "style": "normal",
        "fallback": "Arial",
        # Painted above the fold: the hero <h1> is the LCP element.
        "preload": True,
    },
    {
        "id": "manrope",
        "family": "Manrope",
        "url": f"{GF_RAW}/manrope/Manrope%5Bwght%5D.ttf",
        "src": "Manrope[wght].ttf",
        "instance": ["wght=400:800"],
        "weight": "400 800",
        "style": "normal",
        "fallback": "Arial",
        # Body copy — every page starts painting text in this.
        "preload": True,
    },
    {
        "id": "spacemono-400",
        "family": "Space Mono",
        "url": f"{GF_RAW}/spacemono/SpaceMono-Regular.ttf",
        "src": "SpaceMono-Regular.ttf",
        "instance": [],
        "weight": "400",
        "style": "normal",
        "fallback": "Courier New",
        "preload": False,
    },
    {
        "id": "spacemono-700",
        "family": "Space Mono",
        "url": f"{GF_RAW}/spacemono/SpaceMono-Bold.ttf",
        "src": "SpaceMono-Bold.ttf",
        "instance": [],
        "weight": "700",
        "style": "normal",
        "fallback": "Courier New",
        # Prices and the eyebrow labels are above the fold and this is the
        # weight they use, so it earns a preload slot too.
        "preload": True,
    },
]

# Metrics of the local fallback faces, used to compute the override percentages
# below. Values are the standard ones (unitsPerEm, ascent, descent, lineGap,
# xAvgCharWidth) shipped by capsize/fontaine for these system faces.
FALLBACK_METRICS = {
    "Arial":       {"upem": 2048, "ascent": 1854, "descent": -434, "lineGap": 67, "avg": 904},
    "Courier New": {"upem": 2048, "ascent": 1705, "descent": -615, "lineGap": 0,  "avg": 1229},
}


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def download(url: str, dest: Path) -> None:
    if dest.exists():
        log(f"cached  {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"fetch   {dest.name}")
    req = urllib.request.Request(url, headers={"User-Agent": "shopik-font-build"})
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f)


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout, file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(f"command failed: {' '.join(cmd)}")


# Frequency weights the original OS/2 spec (xAvgCharWidth versions 0-3) used to
# average lowercase advance widths. The fallback numbers below — Arial's 904,
# Courier New's 1229 — were produced with exactly this table, so the webfont's
# average has to be computed the same way for the ratio to mean anything. Taking
# a modern all-glyph mean instead (what OS/2 v4 stores) compares two different
# quantities and yields a size-adjust that is visibly too wide.
AVG_WIDTH_WEIGHTS = {
    " ": 166, "a": 64, "b": 14, "c": 27, "d": 35, "e": 100, "f": 20, "g": 14,
    "h": 42, "i": 63, "j": 3, "k": 6, "l": 35, "m": 20, "n": 56, "o": 56,
    "p": 17, "q": 4, "r": 49, "s": 56, "t": 71, "u": 31, "v": 10, "w": 18,
    "x": 3, "y": 18, "z": 2,
}


def freeze_timestamp(path: Path) -> None:
    """Zero the `head.modified` field so repeated builds are byte-identical."""
    from fontTools.ttLib import TTFont

    # recalcTimestamp=False is the load flag that matters: without it fontTools
    # re-stamps `head.modified` with the current time on save, undoing the very
    # thing we're setting here.
    font = TTFont(str(path), recalcTimestamp=False)
    font["head"].modified = font["head"].created
    font.save(str(path))
    font.close()


def font_metrics(path: Path) -> dict:
    """Read the metrics needed for the metric-matched fallback @font-face."""
    from fontTools.ttLib import TTFont

    font = TTFont(str(path))
    upem = font["head"].unitsPerEm
    hhea, os2 = font["hhea"], font["OS/2"]

    # Prefer the typographic (OS/2 sTypo*) metrics when the font asks for them —
    # that's what the browser uses when USE_TYPO_METRICS (fsSelection bit 7) is
    # set — otherwise fall back to hhea, which is what most browsers use.
    if getattr(os2, "fsSelection", 0) & (1 << 7):
        ascent, descent, line_gap = os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap
    else:
        ascent, descent, line_gap = hhea.ascent, hhea.descent, hhea.lineGap

    hmtx, cmap = font["hmtx"], font.getBestCmap()
    total = weighted = 0
    for char, weight in AVG_WIDTH_WEIGHTS.items():
        glyph = cmap.get(ord(char))
        if glyph is None:
            continue
        weighted += hmtx[glyph][0] * weight
        total += weight
    avg = weighted / total if total else upem // 2

    font.close()
    return {"upem": upem, "ascent": ascent, "descent": descent, "lineGap": line_gap, "avg": avg}


def fallback_rule(family: str, fallback: str, metrics: dict, weight: str, style: str) -> str:
    """
    Build an @font-face that re-shapes a LOCAL system font to the webfont's own
    metrics. While the real font is still downloading the browser paints this
    instead, and because the two occupy the same space, the swap costs no layout
    shift — the whole point of the exercise for CLS.
    """
    fb = FALLBACK_METRICS[fallback]
    size_adjust = (metrics["avg"] / metrics["upem"]) / (fb["avg"] / fb["upem"])
    # The overrides are expressed relative to the ALREADY size-adjusted em, so
    # each one is divided by size_adjust as well.
    scale = metrics["upem"] * size_adjust
    pct = lambda v: f"{abs(v) / scale * 100:.4f}%"
    return (
        f"@font-face {{\n"
        f"  font-family: '{family} Fallback';\n"
        f"  src: local('{fallback}');\n"
        f"  font-weight: {weight};\n"
        f"  font-style: {style};\n"
        f"  size-adjust: {size_adjust * 100:.4f}%;\n"
        f"  ascent-override: {pct(metrics['ascent'])};\n"
        f"  descent-override: {pct(metrics['descent'])};\n"
        f"  line-gap-override: {pct(metrics['lineGap'])};\n"
        f"}}\n"
    )


def main() -> None:
    try:
        import fontTools  # noqa: F401
        import brotli     # noqa: F401
    except ImportError:
        raise SystemExit('missing deps — run: pip install "fonttools[woff]" brotli')
    if not shutil.which("pyftsubset"):
        raise SystemExit('pyftsubset not on PATH — run: pip install "fonttools[woff]" brotli')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.woff2"):
        stale.unlink()

    faces, preloads = [], []

    for spec in FAMILIES:
        print(f"\n{spec['family']} ({spec['weight']})")
        src = SRC_DIR / spec["src"]
        download(spec["url"], src)

        with tempfile.TemporaryDirectory() as tmp:
            staged = Path(tmp) / "staged.ttf"

            if spec["instance"]:
                log(f"slice   {' '.join(spec['instance'])}")
                run(["fonttools", "varLib.instancer", str(src), *spec["instance"],
                     "-o", str(staged)])
                # fontTools stamps `head.modified` with the current time on save,
                # which would give every rebuild a different content hash — and
                # therefore a new URL — even when the glyphs are byte-identical.
                # Pin it so re-running this script is a no-op unless the font
                # or the subsetting rules actually changed.
                freeze_timestamp(staged)
            else:
                shutil.copyfile(src, staged)

            out_tmp = Path(tmp) / "out.woff2"
            log("subset  Czech charset")
            run([
                "pyftsubset", str(staged),
                f"--output-file={out_tmp}",
                "--flavor=woff2",
                f"--unicodes={UNICODES}",
                f"--layout-features={LAYOUT_FEATURES}",
                "--no-hinting",
                "--desubroutinize",
                "--drop-tables+=DSIG",
                "--name-IDs=*",
                "--name-legacy",
            ])

            # Content hash in the filename lets /fonts/** be served `immutable`:
            # re-running this script after a font update produces a new URL, so
            # nothing can be served stale from a CDN or browser cache.
            digest = hashlib.sha256(out_tmp.read_bytes()).hexdigest()[:8]
            name = f"{spec['id']}-{digest}.woff2"
            shutil.copyfile(out_tmp, OUT_DIR / name)

            size = (OUT_DIR / name).stat().st_size
            log(f"write   {name}  ({size / 1024:.1f} KB, from {src.stat().st_size / 1024:.0f} KB)")

            metrics = font_metrics(staged)

        faces.append({**spec, "file": name, "metrics": metrics, "size": size})
        if spec["preload"]:
            preloads.append(name)

    # ── Emit the stylesheet ───────────────────────────────────────────────────
    lines = [
        "/* ══════════════════════════════════════════════════════════════════",
        "   GENERATED by scripts/build-fonts.py — do not edit by hand.",
        "",
        "   Three self-hosted families, subsetted to the Czech charset. Each",
        "   `@font-face` below is paired with a metric-matched `… Fallback`",
        "   face built from a local system font, so the text that paints before",
        "   the webfont arrives occupies exactly the same space — swapping it in",
        "   shifts nothing. Reference these through the --font-* tokens in",
        "   main.css, never by raw family name.",
        "   ══════════════════════════════════════════════════════════════════ */",
        "",
    ]

    for f in faces:
        lines.append(
            f"@font-face {{\n"
            f"  font-family: '{f['family']}';\n"
            f"  src: url('/fonts/{f['file']}') format('woff2');\n"
            f"  font-weight: {f['weight']};\n"
            f"  font-style: {f['style']};\n"
            f"  font-display: swap;\n"
            f"  unicode-range: {UNICODES};\n"
            f"}}\n"
        )

    # One fallback face per family — the mono family declares two weights, but a
    # single fallback covering 400-700 is enough to hold the metrics.
    seen = set()
    for f in faces:
        if f["family"] in seen:
            continue
        seen.add(f["family"])
        weight = "400 700" if f["family"] == "Space Mono" else f["weight"]
        lines.append(fallback_rule(f["family"], f["fallback"], f["metrics"], weight, f["style"]))

    CSS_OUT.write_text("\n".join(lines), encoding="utf8")

    MANIFEST.write_text(json.dumps({
        "preload": preloads,
        "files": [{"file": f["file"], "family": f["family"], "size": f["size"]} for f in faces],
    }, indent=2) + "\n", encoding="utf8")

    total = sum(f["size"] for f in faces)
    print(f"\n{len(faces)} files, {total / 1024:.1f} KB total")
    print(f"  → {OUT_DIR.relative_to(ROOT)}/")
    print(f"  → {CSS_OUT.relative_to(ROOT)}")
    print(f"  → {MANIFEST.relative_to(ROOT)}  (preload: {', '.join(preloads)})")


if __name__ == "__main__":
    main()
