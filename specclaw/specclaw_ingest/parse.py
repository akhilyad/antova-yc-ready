"""Manifest loading, PDF parsing, section tagging and quote verification."""

from __future__ import annotations

import hashlib
import html
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
from pydantic import ValidationError

from specclaw_ingest.ontology import HEADING_SECTIONS
from specclaw_ingest.values import is_abbreviation
from specclaw_ingest.types import (
    Citation,
    DocumentEntry,
    PageText,
    ParsedDocument,
    Section,
    TenderManifest,
    Word,
)

TENDER_ID_PATTERN = r"^[A-Z0-9-]{1,64}$"
RATE_TABLE_PATTERN = r"[A-Za-z0-9_-]{1,64}"
RATES_DIR = Path(__file__).resolve().parent / "rates"
MIN_PAGE_TEXT_CHARS = 20
MIN_QUOTE_WORDS = 3


class ManifestError(ValueError):
    """The tender folder's manifest is missing, malformed or inconsistent."""


class DocumentUnreadable(Exception):
    """A PDF could not be opened or read."""

    def __init__(self, filename: str, reason: str):
        super().__init__(f"{filename}: {reason}")
        self.filename = filename
        self.reason = reason


def load_manifest(tender_dir: Path) -> TenderManifest:
    tender_dir = Path(tender_dir)
    path = tender_dir / "manifest.json"
    try:
        manifest = TenderManifest.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError as exc:
        raise ManifestError(f"manifest.json not found in {tender_dir}") from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ManifestError(f"invalid manifest.json: {exc}") from exc
    if not re.fullmatch(TENDER_ID_PATTERN, manifest.tender_id):
        raise ManifestError(f"invalid tender_id {manifest.tender_id!r}")
    roles = [d.role for d in manifest.documents]
    if roles.count("mr_spec") != 1:
        raise ManifestError("manifest must list exactly one mr_spec document")
    if roles.count("vendor_bid") < 1:
        raise ManifestError("manifest must list at least one vendor_bid document")
    # The rate table is a bare name inside specclaw_ingest/rates; a manifest cannot point elsewhere.
    if not re.fullmatch(RATE_TABLE_PATTERN, manifest.rate_table):
        raise ManifestError(f"invalid rate_table name {manifest.rate_table!r}")
    if not (RATES_DIR / f"{manifest.rate_table}.json").is_file():
        raise ManifestError(f"unknown rate_table {manifest.rate_table!r}")
    root = tender_dir.resolve()
    seen_files: set[Path] = set()
    seen_vendors: set[str] = set()
    for doc in manifest.documents:
        if doc.role == "vendor_bid" and not doc.vendor_id:
            raise ManifestError(f"vendor_bid {doc.file} has no vendor_id")
        if Path(doc.file).is_absolute() or Path(doc.file).drive:
            raise ManifestError(f"listed file must be a path relative to the tender folder: {doc.file}")
        resolved = (root / doc.file).resolve()
        if not resolved.is_relative_to(root):
            raise ManifestError(f"listed file is outside the tender folder: {doc.file}")
        if not resolved.is_file():
            raise ManifestError(f"listed file not found: {doc.file}")
        if resolved in seen_files:
            raise ManifestError(f"duplicate file in manifest: {doc.file}")
        seen_files.add(resolved)
        if doc.role == "vendor_bid":
            if doc.vendor_id in seen_vendors:
                raise ManifestError(f"duplicate vendor_id in manifest: {doc.vendor_id}")
            seen_vendors.add(doc.vendor_id)
    return manifest


def _library_reason(exc: Exception, path: Path) -> str:
    """The PDF library's first message line, with any folder path cut down to the file name."""
    text = (str(exc).splitlines() or [type(exc).__name__])[0]
    for spelling in {str(path), path.as_posix(), repr(str(path))[1:-1]}:
        text = text.replace(spelling, path.name)
    return text


def parse_pdf(path: Path) -> list[PageText]:
    path = Path(path)
    try:
        doc = fitz.open(path)
    except Exception as exc:  # PyMuPDF raises several types for unreadable files
        # The library's message names the full path on this machine; warnings are shown to users.
        raise DocumentUnreadable(path.name, f"cannot open PDF ({_library_reason(exc, path)})") from exc
    try:
        if doc.needs_pass or doc.is_encrypted:
            raise DocumentUnreadable(path.name, "PDF is encrypted")
        pages = []
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text", sort=True)
            # Reading order: block, then line, then word. Sorting by position instead would
            # interleave the lines of two columns and break every quote in the right-hand one.
            raw_words = sorted(page.get_text("words"), key=lambda w: (int(w[5]), int(w[6]), int(w[7])))
            words = [Word(*(round(v, 1) for v in w[:4]), w[4], int(w[5]), int(w[6])) for w in raw_words]
            pages.append(PageText(index, text, words, has_text=len(text.strip()) >= MIN_PAGE_TEXT_CHARS,
                                  width=round(page.rect.width, 1), height=round(page.rect.height, 1)))
        if not pages:
            raise DocumentUnreadable(path.name, "PDF has no pages")
        if not any(p.has_text for p in pages):
            # Text-based PDFs only in v1 (spec §2): a scan is unreadable, not an empty offer.
            raise DocumentUnreadable(path.name, "PDF has no extractable text (scanned document; OCR is not supported)")
        return pages
    except DocumentUnreadable:
        raise
    except Exception as exc:
        raise DocumentUnreadable(path.name, f"cannot read PDF ({_library_reason(exc, path)})") from exc
    finally:
        doc.close()


_SECTION_NUMBER = re.compile(r"^\d{1,3}(?:\.\d{1,3})*\.?\s+")  # "5. ", "4.2 ", never a quantity like "2500 A"
_SMALL_WORDS = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "&"}
_PAGE_NUMBER_LINE = re.compile(r"(?:page\s*)?#(?:\s*(?:of|/)\s*#)?", re.IGNORECASE)

# A heading sits in a page's first lines. On a two-column page the other column may start a
# little higher, so the "first lines" are every line within a band below the top line. The band
# is a share of the page height (drawings are often A3, bids Letter or A4); the fixed distance
# is used only for a page whose size is unknown.
HEADING_BAND_SHARE = 0.12
HEADING_BAND_PT = 72.0
MAX_BAND_LINES = 10
MAX_HEADING_LINES = 3  # a heading may wrap over this many lines
TITLE_CASE_MAX_WORDS = 6
# A line seen at the top or bottom of at least this share of pages is a running header or
# footer (company name, offer number, page count), never a section heading.
RUNNING_SHARE = 0.6
RUNNING_MIN_PAGES = 3
EDGE_LINES = 3


@dataclass(frozen=True)
class _Line:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


def _visual_lines(page: PageText) -> list[_Line]:
    """The page's text lines in reading position order: top to bottom, then left to right."""
    if not page.words:  # a page built from text alone
        return [_Line(0.0, 12.0 * i, 400.0, 12.0 * i + 10.0, line.strip())
                for i, line in enumerate(l for l in page.text.splitlines() if l.strip())]
    groups: dict[tuple[int, int], list[Word]] = {}
    for word in page.words:
        groups.setdefault((word.block, word.line), []).append(word)
    lines = [
        _Line(min(w.x0 for w in ws), min(w.y0 for w in ws), max(w.x1 for w in ws), max(w.y1 for w in ws),
              " ".join(w.text for w in ws))
        for ws in groups.values()
    ]
    return sorted(lines, key=lambda line: (line.y0, line.x0))


def _running_key(text: str) -> str:
    """A line with its digits masked, so 'Page 3 of 30' and 'Page 4 of 30' are the same line."""
    return " ".join(re.sub(r"\d+", "#", normalize(text)).split())


def _running_lines(pages_lines: list[list[_Line]]) -> set[str]:
    with_text = [lines for lines in pages_lines if lines]
    counts: dict[str, int] = {}
    for lines in with_text:
        for key in {_running_key(line.text) for line in lines[:EDGE_LINES] + lines[-EDGE_LINES:]}:
            counts[key] = counts.get(key, 0) + 1
    needed = max(RUNNING_MIN_PAGES, math.ceil(RUNNING_SHARE * len(with_text)))
    return {key for key, count in counts.items() if count >= needed}


def _keyword_section(text: str) -> Section | None:
    for phrases, section in HEADING_SECTIONS:
        if any(re.search(rf"\b{re.escape(phrase)}\b", text) for phrase in phrases):
            return section
    return None


def _heading_section(text: str, title_case: bool = False) -> Section | None:
    """Return the section a heading line opens, or None if the text is not a heading.

    A heading is a line in capitals: at least two words, or one word behind a section number.
    With `title_case`, a short numbered line in title case ("3. Technical Datasheet") also counts.
    """
    stripped = text.strip()
    numbered = bool(_SECTION_NUMBER.match(stripped))
    line = _SECTION_NUMBER.sub("", stripped)
    words = [w.strip(",:;()") for w in line.split()]
    letter_words = [w for w in words if w.isalpha()]
    if not letter_words:
        return None
    if line.upper() == line:
        if len(letter_words) >= 2 or (numbered and len(letter_words[0]) >= 4):
            return _keyword_section(line) or "general"
        return None
    if not (title_case and numbered) or len(words) > TITLE_CASE_MAX_WORDS or line[-1] in ".,;:!?":
        return None
    if not all(w[:1].isupper() or w.lower() in _SMALL_WORDS for w in words if w):
        return None
    return _keyword_section(line.upper()) or "general"


def _is_capitals(text: str) -> bool:
    return text.upper() == text and any(c.isalpha() for c in text)


def _heading_variants(band: list[_Line], index: int) -> list[str]:
    """The line alone, then joined with the capital lines that continue it directly below."""
    line = band[index]
    variants = [line.text]
    if not _is_capitals(_SECTION_NUMBER.sub("", line.text.strip()) or line.text):
        return variants
    current = line
    while len(variants) < MAX_HEADING_LINES:
        height = max(current.y1 - current.y0, 1.0)
        below = [
            other for other in band
            if other.y0 > current.y0 and other.y0 - current.y1 <= height
            and other.x0 < current.x1 and current.x0 < other.x1  # same column
        ]
        if not below:
            break
        nxt = min(below, key=lambda other: other.y0)
        if not _is_capitals(nxt.text) or _SECTION_NUMBER.match(nxt.text.strip()):
            break
        variants.append(f"{variants[-1]} {nxt.text}")
        current = nxt
    return variants


def _line_heading(band: list[_Line], index: int, first: bool) -> Section | None:
    variants = _heading_variants(band, index)
    sections = [_heading_section(text, title_case=first) for text in variants]
    # The longest reading that names a known section wins ("5. BILL OF" + "MATERIALS").
    for section in reversed(sections):
        if section not in (None, "general"):
            return section
    if "general" not in sections:
        return None
    # A plain heading in capitals opens a general section. Away from the first line it must
    # carry a section number, so a table header in capitals is not taken for one.
    return "general" if first or _SECTION_NUMBER.match(band[index].text.strip()) else None


def _page_heading(lines: list[_Line], running: set[str], height: float = 0.0) -> Section | None:
    body = [
        line for line in lines
        if (key := _running_key(line.text)) not in running and not _PAGE_NUMBER_LINE.fullmatch(key.strip("-–— |"))
    ]
    if not body:
        return None
    reach = HEADING_BAND_SHARE * height if height > 0 else HEADING_BAND_PT
    band = [line for line in body if line.y0 - body[0].y0 <= reach][:MAX_BAND_LINES]
    first = _line_heading(band, 0, first=True)
    if first is not None:
        return first
    for index in range(1, len(band)):
        section = _line_heading(band, index, first=False)
        if section is not None:
            return section
    return None


def tag_sections(pages: list[PageText], is_mr: bool) -> None:
    """Tag each page from the heading in its first lines; a section carries over until the next heading."""
    if is_mr:
        for page in pages:
            page.section = "mr_spec"
        return
    pages_lines = [_visual_lines(page) for page in pages]
    running = _running_lines(pages_lines)
    current: Section = "unlabeled"
    for page, lines in zip(pages, pages_lines):
        heading = _page_heading(lines, running, page.height)
        if heading is not None:
            current = heading
        page.section = current


def parse_document(tender_dir: Path, entry: DocumentEntry) -> ParsedDocument:
    path = Path(tender_dir) / entry.file
    sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    pages = parse_pdf(path)
    tag_sections(pages, is_mr=entry.role == "mr_spec")
    return ParsedDocument(entry=entry, sha256=sha256, pages=pages)


_CHAR_MAP = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", "­": None})


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).translate(_CHAR_MAP).lower()


def _squash(text: str) -> str:
    return "".join(normalize(text).split())


_TRAILING_PUNCT = set(".,;:!?)]\"'")
_SENTENCE_END = (".", "!", "?")


def _ends_sentence(words: list[Word], index: int) -> bool:
    """A word ends its sentence with . ! or ?, unless the full stop belongs to an abbreviation
    that the next word of the block continues ("Ed. 2", "approx. 3 s", "No. 7")."""
    word = words[index]
    if not word.text.rstrip("\"')]").endswith(_SENTENCE_END):
        return False
    following = words[index + 1] if index + 1 < len(words) and words[index + 1].block == word.block else None
    return not is_abbreviation(word.text, following.text if following else None)


_HYPHENS = ("-", "‐")


def _wraps_with_hyphen(words: list[Word], index: int) -> bool:
    """True when words[index] ends its line with a hyphen and the same block goes on below.

    Either a word was broken ("switch-" / "gear") or a real hyphen fell at the line end
    ("62271-" / "200", "SF6-" / "free"). The page cannot tell which; the caller decides.
    A dash standing alone ("Rated voltage -") is neither.
    """
    if index + 1 >= len(words):
        return False
    word, following = words[index], words[index + 1]
    text = word.text
    return (len(text) > 1 and text.endswith(_HYPHENS) and text[-2].isalnum()
            and following.block == word.block and following.line != word.line)


def words_text(words: list[Word], dehyphenate: bool = False) -> str:
    """The words as running text. A word wrapped at a line-end hyphen is joined to its other half:
    with the hyphen kept ("62271-200", "short-time"), or dropped when `dehyphenate` is set."""
    pieces: list[str] = []
    for index, word in enumerate(words):
        if _wraps_with_hyphen(words, index):
            pieces.append(word.text[:-1] if dehyphenate else word.text)
        else:
            pieces.append(word.text + " ")
    return "".join(pieces).rstrip()


def _match_on_page(page: PageText, target: str, dehyphenate: bool = False) -> tuple[int, int] | None:
    """Indices of the first and last word of an occurrence aligned to word boundaries."""
    starts: list[int] = []
    owner: list[int] = []
    pieces: list[str] = []
    offset = 0
    for index, word in enumerate(page.words):
        text = word.text[:-1] if dehyphenate and _wraps_with_hyphen(page.words, index) else word.text
        squashed = _squash(text)
        starts.append(offset)
        pieces.append(squashed)
        owner.extend([index] * len(squashed))
        offset += len(squashed)
    chars = "".join(pieces)
    at = chars.find(target)
    while at >= 0:
        first, last = owner[at], owner[at + len(target) - 1]
        end_of_last_word = starts[last] + len(pieces[last])
        rest = chars[at + len(target): end_of_last_word]
        if at == starts[first] and all(c in _TRAILING_PUNCT for c in rest):
            return first, last
        at = chars.find(target, at + 1)
    return None


def _expand_to_sentence(words: list[Word], first: int, last: int) -> tuple[int, int]:
    """Grow a match to the full sentence, staying inside its text block (paragraph or row)."""
    block = words[first].block
    while first > 0 and words[first - 1].block == block and not _ends_sentence(words, first - 1):
        first -= 1
    while last + 1 < len(words) and words[last + 1].block == block and not _ends_sentence(words, last):
        last += 1
    return first, last


def page_sentences(page: PageText) -> list[tuple[int, int]]:
    """Word-index spans (first, last) of every sentence on the page; a sentence never leaves its text block."""
    spans: list[tuple[int, int]] = []
    words = page.words
    start = 0
    for index, word in enumerate(words):
        block_ends = index + 1 == len(words) or words[index + 1].block != word.block
        if block_ends or _ends_sentence(words, index):
            spans.append((start, index))
            start = index + 1
    return spans


def citation_for_span(doc: ParsedDocument, page_text: PageText, first: int, last: int,
                      match: str = "exact") -> Citation:
    """The citation for words first..last of a page: their text, their box and the block around them."""
    sentence = page_text.words[first: last + 1]
    block = page_text.words[first].block
    dehyphenate = match == "dehyphenated"
    paragraph = words_text([w for w in page_text.words if w.block == block], dehyphenate)
    bbox = (
        round(min(w.x0 for w in sentence), 1),
        round(min(w.y0 for w in sentence), 1),
        round(max(w.x1 for w in sentence), 1),
        round(max(w.y1 for w in sentence), 1),
    )
    by_line: dict[tuple[int, int], list[Word]] = {}
    for word in sentence:
        by_line.setdefault((word.block, word.line), []).append(word)
    rects = tuple(
        (round(min(w.x0 for w in ws), 1), round(min(w.y0 for w in ws), 1),
         round(max(w.x1 for w in ws), 1), round(max(w.y1 for w in ws), 1))
        for ws in by_line.values()
    )
    return Citation(doc.entry.file, page_text.number, bbox, words_text(sentence, dehyphenate),
                    page_text.section, paragraph, match, rects)


def verify_quote(doc: ParsedDocument, page: int, quote: str) -> Citation | None:
    """Find the quote on the cited page (or one page either side) and return its real location.

    The returned citation carries the page's own text: the full sentence or table
    row containing the match, plus the whole block it belongs to. Values are read
    from that text, never from Claude's string.
    """
    if len(quote.split()) < MIN_QUOTE_WORDS:
        return None
    # The prompt XML-escapes page text; a quote copied with its entities is the same passage.
    targets = [t for t in dict.fromkeys((_squash(quote), _squash(html.unescape(quote)))) if t]
    if not targets:
        return None
    for candidate in (page, page - 1, page + 1):
        if not 1 <= candidate <= len(doc.pages):
            continue
        page_text = doc.pages[candidate - 1]
        # The text as printed first, hyphens kept ("62271-200", "SF6-free"). Only if that fails,
        # with line-end hyphens removed ("switch-" + "gear" for a quoted "switchgear").
        wrapped = any(_wraps_with_hyphen(page_text.words, i) for i in range(len(page_text.words)))
        for how in ("exact", "dehyphenated") if wrapped else ("exact",):
            found = next((m for m in (_match_on_page(page_text, t, how == "dehyphenated") for t in targets)
                          if m is not None), None)
            if found is not None:
                first, last = _expand_to_sentence(page_text.words, *found)
                return citation_for_span(doc, page_text, first, last, how)
    return None
