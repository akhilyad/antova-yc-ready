"""Generate the synthetic sample packs.

Usage:
    python -m samples.generate_sample_pack                  # every pack, into samples/<tender id>/
    python -m samples.generate_sample_pack <out_dir>        # TENDER-2026-402 into <out_dir>
    python -m samples.generate_sample_pack --pack TENDER-2026-417 [out_dir]

The output is byte-identical on every run (reportlab invariant mode), so the
file hashes stay stable and saved model responses keep matching.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from samples import scenario, scenario_417

SAMPLES_DIR = Path(__file__).resolve().parent
DEFAULT_OUT = SAMPLES_DIR / scenario.TENDER_ID
# Every pack module offers TENDER_ID, documents(), manifest() and expected();
# raw_files() is optional and returns files written as they are (an unreadable bid).
PACKS = {module.TENDER_ID: module for module in (scenario, scenario_417)}

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 56
TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN
BOTTOM_LIMIT = 60

# kind -> (font, size, line height, space after)
STYLES = {
    "title": ("Helvetica-Bold", 16, 22, 14),
    "h": ("Helvetica-Bold", 12, 16, 10),
    "p": ("Helvetica", 10, 13, 7),
    "row": ("Helvetica", 10, 13, 5),
}


def _draw_scan(c: canvas.Canvas) -> None:
    """A page that was scanned: grey bars where the lines of text would be, and no text."""
    c.setFillGray(0.93)
    c.rect(MARGIN - 16, 50, PAGE_WIDTH - 2 * MARGIN + 32, PAGE_HEIGHT - 100, stroke=0, fill=1)
    c.setFillGray(0.55)
    y = PAGE_HEIGHT - MARGIN - 20
    row = 0
    while y > 90:
        width = TEXT_WIDTH * (0.55 + 0.4 * ((row * 7) % 10) / 10)
        c.rect(MARGIN, y, width, 5, stroke=0, fill=1)
        y -= 16
        row += 1
    c.setFillGray(0)


COLUMN_GAP = 24
COLUMN_SEPARATOR = "\x1f"


def _draw_columns(c: canvas.Canvas, text: str, y: float) -> float:
    """Two paragraphs side by side (left and right separated by COLUMN_SEPARATOR). Each column is
    its own text object, as a two-column layout is in a real PDF."""
    font, size, leading, gap = STYLES["p"]
    width = (TEXT_WIDTH - COLUMN_GAP) / 2
    bottom = y
    for index, column in enumerate(text.split(COLUMN_SEPARATOR)):
        x = MARGIN + index * (width + COLUMN_GAP)
        text_object = c.beginText(x, y)
        text_object.setFont(font, size, leading)
        lines = simpleSplit(column, font, size, width)
        for line in lines:
            text_object.textLine(line)
        c.drawText(text_object)
        bottom = min(bottom, y - leading * len(lines))
    return bottom - gap


def _render(path: Path, doc: scenario.DocumentSpec) -> None:
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
    c.setTitle(doc.title)
    c.setAuthor("Specclaw sample generator")
    c.setSubject(scenario.FOOTER)
    total = len(doc.pages)
    for number, page in enumerate(doc.pages, start=1):
        if page.scanned:
            _draw_scan(c)
            c.showPage()
            continue
        if doc.running_header:
            c.setFont("Helvetica", 8)
            c.drawString(MARGIN, PAGE_HEIGHT - 30, doc.running_header)
        if page.drawing:
            c.setLineWidth(0.8)
            c.rect(MARGIN - 20, 40, PAGE_WIDTH - 2 * MARGIN + 40, PAGE_HEIGHT - 70)
            c.rect(PAGE_WIDTH - MARGIN - 200, 48, 200, 36)
            c.setFont("Helvetica", 8)
            c.drawString(PAGE_WIDTH - MARGIN - 192, 62, page.drawing)
        y = PAGE_HEIGHT - MARGIN
        for kind, text in page.blocks:
            if kind == "cols":
                y = _draw_columns(c, text, y)
                continue
            # "lines": a paragraph whose line breaks are given, so a word can wrap where we want it.
            font, size, leading, gap = STYLES["p" if kind == "lines" else kind]
            for line in (text.split("\n") if kind == "lines" else simpleSplit(text, font, size, TEXT_WIDTH)):
                if y < BOTTOM_LIMIT + (40 if page.drawing else 0):
                    raise ValueError(f"{doc.filename} page {number} overflows")
                c.setFont(font, size)
                c.drawString(MARGIN, y, line)
                y -= leading
            y -= gap
        c.setFont("Helvetica", 8)
        c.drawString(MARGIN, 28, f"{scenario.FOOTER} · Page {number} of {total}")
        c.showPage()
    c.save()


def _write_json(path: Path, data: dict) -> None:
    path.write_bytes((json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))


def pack_files(pack=scenario) -> list[str]:
    """Every file a pack consists of, PDFs first."""
    names = [doc.filename for doc in pack.documents()]
    names += sorted(getattr(pack, "raw_files", dict)())
    return names + ["manifest.json", "expected.json"]


def generate(out_dir: Path, pack=scenario) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for doc in pack.documents():
        _render(out_dir / doc.filename, doc)
    for name, content in getattr(pack, "raw_files", dict)().items():
        (out_dir / name).write_bytes(content)
    _write_json(out_dir / "manifest.json", pack.manifest())
    _write_json(out_dir / "expected.json", pack.expected())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m samples.generate_sample_pack", description=__doc__.splitlines()[0])
    parser.add_argument("out_dir", nargs="?", type=Path)
    parser.add_argument("--pack", choices=sorted(PACKS), help="the tender to generate (default: every pack)")
    args = parser.parse_args(argv)
    if args.pack is None and args.out_dir is None:
        targets = [(pack, SAMPLES_DIR / tender_id) for tender_id, pack in PACKS.items()]
    else:
        pack = PACKS[args.pack or scenario.TENDER_ID]
        targets = [(pack, args.out_dir or SAMPLES_DIR / pack.TENDER_ID)]
    for pack, target in targets:
        generate(target, pack)
        print(f"wrote sample pack {pack.TENDER_ID} to {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
