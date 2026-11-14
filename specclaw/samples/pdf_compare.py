"""Compare generated PDFs with the committed ones without depending on the zlib build.

The generator's PDFs hold ASCII85+Flate streams. Flate output is not unique: the same text
compresses to different bytes under different zlib builds (CPython 3.14 on Windows ships zlib-ng,
Linux uses zlib), so the committed files (written on Windows) are not byte-for-byte what CI's
Linux generates. What the committed pack must equal is the *content*: so each stream is decoded,
and the length fields and the cross-reference table, which follow from the compressed sizes,
are left out of the comparison.
"""

from __future__ import annotations

import base64
import re
import zlib

_STREAM = re.compile(rb"/Filter \[ /ASCII85Decode /FlateDecode \] /Length (\d+)\n>>\nstream\n")


def content_form(pdf: bytes) -> bytes:
    """`pdf` with every stream decoded and its sizes, the xref table and the trailer removed."""
    out: list[bytes] = []
    pos = 0
    for match in _STREAM.finditer(pdf):
        if match.start() < pos:
            continue
        body = pdf[match.end():match.end() + int(match.group(1))].rstrip(b"\n")
        decoded = zlib.decompress(base64.a85decode(body[:-2] if body.endswith(b"~>") else body))
        out.append(pdf[pos:match.start(1)] + b"*" + pdf[match.end(1):match.end()] + decoded)
        pos = match.end() + int(match.group(1))
    out.append(pdf[pos:])
    text = b"".join(out)
    cut = text.rfind(b"\nxref\n")
    return text if cut < 0 else text[:cut]
