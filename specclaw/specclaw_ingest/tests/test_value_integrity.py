"""WP3: value integrity. One RED/GREEN pair per item, with strings in the style of real bids."""

import pytest

from samples import mutate
from specclaw_engine import ComplianceStatus
from specclaw_ingest import values
from specclaw_ingest.ontology import PARAMETERS, PARAMS_BY_ID
from specclaw_ingest.parse import page_sentences, verify_quote, words_text
from specclaw_ingest.pipeline import read_values, run_ingest
from specclaw_ingest.tests.fakes import AnswerKeyLocator
from specclaw_ingest.types import Citation, DocumentEntry, FieldValue, PageText, ParsedDocument, Word
from specclaw_ingest.values import (
    detect_locale,
    normalize_numbers,
    parse_field,
    plausible,
    split_sentences,
    value_in_span,
)


def _doc(blocks: list[list[str]], section: str = "datasheet") -> ParsedDocument:
    """A one-page bid. Each block is a list of text lines, so a word can wrap at a line end."""
    words, y = [], 100.0
    for block, lines in enumerate(blocks):
        for line_no, line in enumerate(lines):
            for index, token in enumerate(line.split()):
                words.append(Word(50.0 + 30 * index, y, 78.0 + 30 * index, y + 10, token, block, line_no))
            y += 14
        y += 10
    text = "\n".join(line for lines in blocks for line in lines)
    entry = DocumentEntry(file="bid.pdf", role="vendor_bid", vendor_id="vendor-x")
    return ParsedDocument(entry, "0" * 64, [PageText(1, text, words, section=section)])


def _cite(quote: str, page: int = 1, section: str = "datasheet") -> Citation:
    return Citation("bid.pdf", page, (1.0, 2.0, 3.0, 4.0), quote, section, quote)


def _cells(tender):
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


def _mutated(tmp_path, tender_id: str, edit):
    pack = mutate.base_pack()
    edit(pack)
    pack.manifest["tender_id"] = pack.expected["tender_id"] = tender_id
    return run_ingest(mutate.write(pack, tmp_path), locator=AnswerKeyLocator(pack.expected)), pack


# --- sentence splitting (2b) ------------------------------------------------------

@pytest.mark.parametrize("text", [
    "Relays communicate via IEC 61850 Ed. 2 with PRP redundancy.",
    "BOM Pos. 44 covers the standard communication port.",
    "The busbar is rated for a fault level, e.g. 50 kA, as standard.",
    "Thermal withstand of approx. 3 s is available.",
    "See drawing No. 7 for the bay arrangement.",
])
def test_abbreviations_do_not_end_a_sentence(text):
    assert split_sentences(text) == [text]


def test_real_sentence_ends_still_split():
    assert split_sentences("Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price.") == [
        "Standard switchgear bay rated 31.5kA 1s.", "50kA high-duty upgrade excluded from base price."]
    assert split_sentences("Witnessing: No. Routine tests only.") == ["Witnessing: No.", "Routine tests only."]
    assert split_sentences("Rated 40 °C max. Derating applies above that.") == ["Rated 40 °C max.", "Derating applies above that."]


def test_protocol_reads_across_an_edition_abbreviation():
    value = parse_field("protocol", "Protection IEDs with IEC 61850 Ed. 2 and PRP dual-port fibre.", "protocol")
    assert value.value == "IEC61850_ED2_PRP"


def test_citation_sentence_does_not_stop_at_an_abbreviation():
    doc = _doc([["Short-time withstand current of approx. 31.5 kA for 1 s. Other ratings on request."]])
    citation = verify_quote(doc, 1, "approx. 31.5 kA for 1 s.")
    assert citation.quote == "Short-time withstand current of approx. 31.5 kA for 1 s."
    spans = page_sentences(doc.pages[0])
    assert len(spans) == 2


# --- dehyphenation (1b) -------------------------------------------------------------

def test_quote_matches_a_word_hyphenated_at_a_line_end():
    doc = _doc([["The medium voltage switch-", "gear is rated 31.5 kA for 1 s short-time."]])
    citation = verify_quote(doc, 1, "The medium voltage switchgear is rated 31.5 kA for 1 s short-time.")
    assert citation is not None and citation.match == "dehyphenated"
    assert citation.quote == "The medium voltage switchgear is rated 31.5 kA for 1 s short-time."


def test_a_real_hyphen_at_a_line_end_is_kept():
    doc = _doc([["Type tested to IEC 62271-", "200 with an SF6-", "free insulating gas mixture."]])
    citation = verify_quote(doc, 1, "Type tested to IEC 62271-200 with an SF6-free insulating gas mixture.")
    assert citation is not None and citation.match == "exact"
    assert citation.quote == "Type tested to IEC 62271-200 with an SF6-free insulating gas mixture."
    # The joined form would be wrong for a standard number and is not what the quote says.
    assert verify_quote(doc, 1, "Type tested to IEC 62271200 with an SF6free insulating gas mixture.") is not None
    assert verify_quote(doc, 1, "Type tested to IEC 62271200 with an SF6free insulating gas mixture.").match == "dehyphenated"


def test_page_text_keeps_a_wrapped_compound_together():
    doc = _doc([["Rated short-", "time withstand current 50 kA for 3 s."]])
    assert words_text(doc.pages[0].words) == "Rated short-time withstand current 50 kA for 3 s."
    assert parse_field("current", words_text(doc.pages[0].words), "ik").display == "50 kA"


def test_a_dash_between_columns_is_not_a_hyphen():
    doc = _doc([["Rated voltage -", "36 kV as required"]])
    assert words_text(doc.pages[0].words) == "Rated voltage - 36 kV as required"


# --- number locale (2a) -----------------------------------------------------------

def test_locale_is_detected_from_unambiguous_tokens():
    assert detect_locale(["Standard bay rated 31,5 kA.", "Total price: EUR 418.000,00"]) == "eu"
    assert detect_locale(["Standard bay rated 31.5kA 1s.", "Total price: €418,000"]) == "en"
    assert detect_locale(["Busbars rated 2,500 A.", "Rated voltage 36 kV."]) == "unknown"
    assert detect_locale(["Rated 31,5 kA.", "Derated to 28.5 kA above 40 °C."]) == "mixed"


def test_a_price_with_a_three_digit_group_is_locale_evidence():
    # Money has at most two decimals, so "418.000" can only be four hundred and eighteen thousand.
    assert detect_locale(["Total lump-sum price: €418.000"]) == "eu"
    assert detect_locale(["Total lump-sum price: EUR 452,000"]) == "en"


def test_section_numbers_and_codes_are_not_locale_evidence():
    assert detect_locale(["See clause 4.2 and drawing p.11.", "Alloy E-AlMgSi0.5, IEC 62271-200 Ed.2."]) == "unknown"


def test_european_decimal_comma_is_read():
    text, ambiguous = normalize_numbers("Standard switchgear bay rated 31,5 kA for 1,0 s.", "eu")
    assert ambiguous == []
    assert parse_field("current", text, "ik").display == "31.5 kA"
    assert parse_field("duration", text, "ik_duration").display == "1 s"


def test_an_unambiguous_token_is_read_whatever_the_document_locale():
    # "31,5" cannot be a thousands group, so it is a decimal even with no evidence at all.
    text, ambiguous = normalize_numbers("Rated 31,5 kA.", "unknown")
    assert (parse_field("current", text, "ik").display, ambiguous) == ("31.5 kA", [])


def test_the_document_locale_decides_an_ambiguous_token():
    assert parse_field("current", normalize_numbers("Busbars rated 2,500 A.", "en")[0], "rated_current").display == "2500 A"
    assert parse_field("current", normalize_numbers("Busbars rated 2.500 A.", "eu")[0], "rated_current").display == "2500 A"
    assert parse_field("current", normalize_numbers("Busbars rated 2,500 A.", "eu")[0], "rated_current").display == "2.5 A"


@pytest.mark.parametrize("locale", ["unknown", "mixed"])
def test_an_ambiguous_token_without_locale_evidence_is_not_guessed(locale):
    text, ambiguous = normalize_numbers("Main busbars rated 2,500 A continuous.", locale)
    assert ambiguous == ["2,500"]
    assert parse_field("current", text, "rated_current") is None
    values_read, notes = read_values("PARAM-02", _cite("Main copper busbars rated 2,500 A continuous."), locale)
    assert "rated_current" not in values_read and values_read["material"].display == "Cu-ETP"
    assert [n["code"] for n in notes] == ["AMBIGUOUS_NUMBER"]
    assert "2,500" in notes[0]["message"] and "p.1" in notes[0]["message"]


def test_ambiguous_number_makes_the_cell_manual_with_the_reason(tmp_path):
    def edit(pack):
        filename = pack.file_of("vendor-a")
        pack.replace_text(filename, "2.5 kA continuous", "2,500 A continuous")
        pack.replace_text(filename, "€452,000", "€452000")

    result, _ = _mutated(tmp_path, "MUT-402-AMBIGUOUS", edit)
    cell = _cells(result.tender)[("vendor-a", "PARAM-02")]
    assert cell.status == ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert [f["code"] for f in cell.flags] == ["AMBIGUOUS_NUMBER"]
    assert "2,500" in cell.flags[0]["message"]
    assert result.stats["locales"]["Bid_vendor-a_Nordwerk.pdf"] == "unknown"


def test_sample_documents_have_the_expected_locales(tmp_path):
    result, _ = _mutated(tmp_path, "MUT-402-BASE", lambda pack: None)
    assert result.stats["locales"] == {
        "MR-33kV-GIS-Rev4.pdf": "unknown", "Bid_vendor-a_Nordwerk.pdf": "en",
        "Bid_vendor-b_VoltSwitch.pdf": "en", "Bid_vendor-c_Deltaport.pdf": "en",
    }


# --- plausibility ranges ----------------------------------------------------------

def test_every_numeric_field_declares_a_plausible_range():
    numeric = {"current", "duration", "voltage", "temperature", "fat_days", "months"}
    for param in PARAMETERS:
        for f in param.fields:
            if f.kind in numeric:
                assert f.plausible is not None, (param.id, f.name)


def test_out_of_range_value_is_not_plausible():
    ik = PARAMS_BY_ID["PARAM-01"].fields[0]
    assert plausible(ik, parse_field("current", "Short-time withstand 31.5 kA.", "ik"))
    assert not plausible(ik, parse_field("current", "Short-time withstand 315 kA.", "ik"))
    assert not plausible(ik, parse_field("current", "Short-time withstand 50 A.", "ik"))
    ambient = PARAMS_BY_ID["PARAM-08"].fields[0]
    assert plausible(ambient, parse_field("temperature", "Maximum ambient temperature 104 °F.", "max_ambient"))
    assert not plausible(ambient, parse_field("temperature", "Maximum ambient temperature 400 °C.", "max_ambient"))


def test_out_of_range_parse_is_dropped_with_the_reason():
    values_read, notes = read_values("PARAM-01", _cite("Rated short-time withstand current 315 kA for 3 s."), "en")
    assert set(values_read) == {"ik_duration"}
    assert [n["code"] for n in notes] == ["IMPLAUSIBLE_VALUE"]
    assert "315 kA" in notes[0]["message"] and "10 kA to 100 kA" in notes[0]["message"]


def test_out_of_range_value_goes_to_manual_in_the_pipeline(tmp_path):
    def edit(pack):
        filename = pack.file_of("vendor-a")
        pack.replace_text(filename, "50 kA / 3 s.", "315 kA / 3 s.")

    result, _ = _mutated(tmp_path, "MUT-402-RANGE", edit)
    cell = _cells(result.tender)[("vendor-a", "PARAM-01")]
    assert cell.status == ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert [f["code"] for f in cell.flags] == ["IMPLAUSIBLE_VALUE"]


# --- number in span -----------------------------------------------------------------

def test_value_in_span_needs_the_number_and_its_unit():
    ik = parse_field("current", "Standard switchgear bay rated 31.5kA 1s.", "ik")
    assert value_in_span(ik, "NOTE 7: Standard switchgear bay rated 31.5kA 1s.")
    assert not value_in_span(ik, "50kA high-duty upgrade excluded from base price.")
    assert not value_in_span(ik, "Rated 31.5 kV at 50 Hz.")  # the number with another unit is not the value
    months = parse_field("months", "Warranty 24 months from commissioning.", "warranty_months")
    assert value_in_span(months, "warranty 24 months from commissioning") and not value_in_span(months, "24 bays")
    assert value_in_span(FieldValue("ip", values.IPCode(5, 4), "IP54"), "Enclosure IP54.")
    assert not value_in_span(FieldValue("ip", values.IPCode(5, 4), "IP54"), "Enclosure IP42.")


def test_a_value_derived_from_wording_needs_no_number():
    zero = parse_field("fat_days", "Witnessed FAT charged extra at €1,300/day.", "witnessed_fat_days_included")
    assert zero.value == 0 and value_in_span(zero, "Witnessed FAT charged extra at €1,300/day.")


def test_a_fragment_quote_is_cited_with_the_text_its_value_came_from(tmp_path):
    """The locator points at the carve-out half of NOTE 7. The value sits in the other half, so the
    citation is widened to the whole note: the number shown is inside the span shown."""
    def edit(pack):
        ideal = pack.locate(pack.file_of("vendor-b"))
        note = next(c for c in ideal["candidates"] if c["param_id"] == "PARAM-01" and c["page"] == 11)
        note["quote"] = "50kA high-duty upgrade excluded from base price."

    result, _ = _mutated(tmp_path, "MUT-402-FRAGMENT", edit)
    cell = _cells(result.tender)[("vendor-b", "PARAM-01")]
    assert cell.status == ComplianceStatus.CONFLICT_DOWNGRADE
    assert "31.5kA 1s" in cell.snippet and "excluded from base price" in cell.snippet
    assert cell.flags == []


def test_every_value_on_the_sample_sits_inside_its_quote(tmp_path):
    result, _ = _mutated(tmp_path, "MUT-402-SPAN", lambda pack: None)
    import json
    resolved = json.loads(result.artifacts["resolved"].body)
    checked = 0
    for file, items in resolved["evidence"].items():
        for item in items:
            text, _ = normalize_numbers(item["citation"]["quote"], resolved["locales"][file])
            for plain in item["values"].values():
                from specclaw_ingest.codec import value_from_plain
                assert value_in_span(value_from_plain(plain), text), (file, item["citation"]["quote"])
                checked += 1
    assert checked > 40
