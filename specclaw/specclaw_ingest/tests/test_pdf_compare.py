"""content_form: equal for the same content compressed differently, different when content differs."""

import base64
import re
import zlib

from samples import generate_sample_pack as gen
from samples.pdf_compare import content_form


def _recompressed(pdf: bytes, level: int, edit=lambda raw: raw) -> bytes:
    """`pdf` with every stream compressed at another level (as a different zlib build would), sizes fixed up.
    `edit` changes each stream's decoded content first."""
    pattern = re.compile(rb"/Filter \[ /ASCII85Decode /FlateDecode \] /Length (\d+)\n>>\nstream\n")
    out, pos = [], 0
    for m in pattern.finditer(pdf):
        end = m.end() + int(m.group(1))
        body = pdf[m.end():end].rstrip(b"\n")
        raw = zlib.decompress(base64.a85decode(body[:-2] if body.endswith(b"~>") else body))
        packed = base64.a85encode(zlib.compress(edit(raw), level)) + b"~>\n"
        out.append(pdf[pos:m.start(1)] + str(len(packed)).encode() + pdf[m.end(1):m.end()] + packed)
        pos = end
    out.append(pdf[pos:])
    return b"".join(out)


def _first_pdf(tmp_path):
    gen.generate(tmp_path)
    return (tmp_path / next(n for n in gen.pack_files(gen.scenario) if n.endswith(".pdf"))).read_bytes()


def test_the_same_content_compressed_differently_compares_equal(tmp_path):
    pdf = _first_pdf(tmp_path)
    other = _recompressed(pdf, 1)
    assert other != pdf  # the bytes really differ
    assert content_form(other) == content_form(pdf)


def test_a_change_of_content_is_seen(tmp_path):
    pdf = _first_pdf(tmp_path)
    changed = _recompressed(pdf, 6, edit=lambda raw: raw.replace(b"Tj", b"TJ", 1) if b"Tj" in raw else raw + b" ")
    assert content_form(changed) != content_form(pdf)


def test_a_change_outside_the_streams_is_seen(tmp_path):
    pdf = _first_pdf(tmp_path)
    assert content_form(pdf.replace(b"endobj", b"endobj ", 1)) != content_form(pdf)


def test_a_file_with_no_streams_is_returned_whole():
    assert content_form(b"%PDF-1.3\nplain\n") == b"%PDF-1.3\nplain\n"
