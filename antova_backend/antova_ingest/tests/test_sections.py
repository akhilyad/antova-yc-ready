"""Section tagging on layouts real bids use (spec §6 is the baseline).

Every PDF here is built inside the test with PyMuPDF: running headers and footers,
headings that wrap over two lines, two-column pages and title-case headings.
"""

from pathlib import Path

import fitz
import pytest

from antova_ingest.parse import DocumentUnreadable, parse_pdf, tag_sections

LEFT, RIGHT = 56, 320
BODY = [
    "The equipment is offered in line with the enquiry documents.",
    "All items are subject to the conditions stated in this offer.",
    "Further details are given in the following pages of this offer.",
]


def _pdf(tmp_path: Path, pages: list[list[tuple[float, float, str]]], name: str = "bid.pdf") -> Path:
    """Each page is a list of (x, baseline y, text) lines."""
    doc = fitz.open()
    for lines in pages:
        page = doc.new_page(width=595, height=842)
        for x, y, text in lines:
            page.insert_text((x, y), text, fontsize=10)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _body(start_y: float, x: float = LEFT, count: int = 3) -> list[tuple[float, float, str]]:
    return [(x, start_y + 14 * i, BODY[i % len(BODY)]) for i in range(count)]


def _sections(path: Path) -> list[str]:
    pages = parse_pdf(path)
    tag_sections(pages, is_mr=False)
    return [p.section for p in pages]


# --- running headers and footers ----------------------------------------------------------------

HEADER = "ORBIS ELEKTRIK - TECHNICAL DATA AND COMMERCIAL OFFER"


def _with_header(number: int, total: int, heading: str | None) -> list[tuple[float, float, str]]:
    lines = [(LEFT, 40, HEADER), (LEFT, 54, f"Offer Q-2026-117 Rev 2 | Page {number} of {total}")]
    if heading:
        lines.append((LEFT, 90, heading))
    lines += _body(110)
    lines.append((LEFT, 810, f"Synthetic test document - page {number}"))
    return lines


def test_running_header_does_not_tag_every_page(tmp_path):
    headings = ["1. COVER LETTER", None, "2. TECHNICAL DATASHEET", None, "3. COMMERCIAL TERMS", "4. QUALITY ASSURANCE"]
    path = _pdf(tmp_path, [_with_header(i, len(headings), h) for i, h in enumerate(headings, start=1)])
    assert _sections(path) == ["cover_letter", "cover_letter", "datasheet", "datasheet", "commercial", "general"]


def test_running_header_alone_leaves_pages_unlabeled(tmp_path):
    """No heading anywhere: the pages go to the locate call unlabeled, not tagged from the header."""
    path = _pdf(tmp_path, [_with_header(i, 4, None) for i in range(1, 5)])
    assert _sections(path) == ["unlabeled"] * 4


def test_heading_repeated_on_a_few_pages_is_still_a_heading(tmp_path):
    """A section title repeated on its own pages is not a running header."""
    pages = [[(LEFT, 60, "1. COVER LETTER"), *_body(80)]]
    pages += [[(LEFT, 60, "2. TECHNICAL DATASHEET"), *_body(80)] for _ in range(2)]
    pages += [[(LEFT, 60, f"{n}. QUALITY ASSURANCE PART {n}"), *_body(80)] for n in range(3, 8)]
    assert _sections(_pdf(tmp_path, pages))[:3] == ["cover_letter", "datasheet", "datasheet"]


# --- headings split across lines ----------------------------------------------------------------

@pytest.mark.parametrize("first,second,section", [
    ("5. BILL OF", "MATERIALS", "bom"),
    ("6. INSPECTION AND", "TEST PLAN", "test_plan"),
    ("3. TECHNICAL", "DATASHEET", "datasheet"),
    ("7. COMMERCIAL TERMS AND", "PRICE SCHEDULE", "commercial"),
    ("8. QUALITY", "ASSURANCE", "general"),
])
def test_heading_split_over_two_lines(tmp_path, first, second, section):
    pages = [
        [(LEFT, 60, "1. COVER LETTER"), *_body(80)],
        [(LEFT, 60, first), (LEFT, 74, second), *_body(100)],
        _body(60),
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["cover_letter", section, section]


def test_centred_heading_split_over_two_lines(tmp_path):
    pages = [[(240, 60, "SINGLE LINE"), (228, 74, "DIAGRAM NOTES"), *_body(100)]]
    assert _sections(_pdf(tmp_path, pages)) == ["drawing"]


def test_capital_line_after_a_heading_is_not_glued_to_it(tmp_path):
    """Only the next line of the same heading joins it; a far-away capital line does not."""
    pages = [[(LEFT, 60, "8. QUALITY ASSURANCE"), *_body(80), (LEFT, 300, "TECHNICAL DATA SUMMARY")]]
    assert _sections(_pdf(tmp_path, pages)) == ["general"]


# --- two-column pages ---------------------------------------------------------------------------

def test_two_column_page_heading_below_the_other_columns_first_line(tmp_path):
    """The right column starts a little higher than the heading in the left column."""
    pages = [
        [(LEFT, 60, "1. COVER LETTER"), *_body(80)],
        [*_body(70, x=RIGHT, count=6), (LEFT, 82, "3. TECHNICAL DATASHEET"), *_body(100, count=4)],
        [*_body(70, x=RIGHT, count=6), *_body(72, count=6)],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["cover_letter", "datasheet", "datasheet"]


def test_two_column_page_numbered_general_heading(tmp_path):
    pages = [
        [(LEFT, 60, "7. COMMERCIAL TERMS"), *_body(80)],
        [*_body(70, x=RIGHT, count=6), (LEFT, 82, "8. QUALITY ASSURANCE"), *_body(100, count=4)],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["commercial", "general"]


def test_capital_keyword_line_far_down_the_page_is_not_a_heading(tmp_path):
    pages = [
        [(LEFT, 60, "7. COMMERCIAL TERMS"), *_body(80)],
        [*_body(60, count=10), (LEFT, 400, "SEE THE BILL OF MATERIALS FOR DETAILS")],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["commercial", "commercial"]


# --- title-case headings ------------------------------------------------------------------------

def test_numbered_title_case_headings(tmp_path):
    pages = [
        [(LEFT, 60, "1. Cover Letter"), *_body(80)],
        [(LEFT, 60, "2. Technical Datasheet"), *_body(80)],
        _body(60),
        [(LEFT, 60, "3 Bill of Materials"), *_body(80)],
        [(LEFT, 60, "4. Quality Assurance"), *_body(80)],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["cover_letter", "datasheet", "datasheet", "bom", "general"]


def test_numbered_list_items_are_not_headings(tmp_path):
    """A documentation page that lists deliverables must not be tagged from the list."""
    listing = [(LEFT, 96, "1. Single line diagram"), (LEFT, 110, "2. Bill of materials"),
               (LEFT, 124, "3. Inspection and test plan")]
    pages = [
        [(LEFT, 60, "9. DOCUMENTATION"), (LEFT, 80, BODY[0]), *listing],
        [(LEFT, 60, "1. The supplier shall submit the bill of materials with the offer."), *listing],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["general", "general"]


def test_sentence_naming_a_section_is_not_a_heading(tmp_path):
    pages = [
        [(LEFT, 60, "5. BILL OF MATERIALS"), *_body(80)],
        [(LEFT, 60, "The technical datasheet is attached to this bill of materials."), *_body(80)],
    ]
    assert _sections(_pdf(tmp_path, pages)) == ["bom", "bom"]


# --- documents with nothing to read -------------------------------------------------------------

def test_pdf_without_pages_is_unreadable(tmp_path, monkeypatch):
    class _Empty:
        needs_pass = is_encrypted = False

        def __iter__(self):
            return iter(())

        def close(self):
            pass

    path = tmp_path / "empty.pdf"
    path.write_bytes(b"%PDF-1.4")
    monkeypatch.setattr(fitz, "open", lambda *args, **kwargs: _Empty())
    with pytest.raises(DocumentUnreadable, match="no pages"):
        parse_pdf(path)


def test_fully_scanned_pdf_is_unreadable(tmp_path):
    """No page has text (a scan): v1 has no OCR, so the document is unreadable, not empty."""
    doc = fitz.open()
    for _ in range(3):
        page = doc.new_page()
        page.draw_rect(fitz.Rect(60, 60, 500, 700), color=(0.5, 0.5, 0.5))
    path = tmp_path / "scan.pdf"
    doc.save(path)
    doc.close()
    with pytest.raises(DocumentUnreadable, match="no extractable text"):
        parse_pdf(path)
