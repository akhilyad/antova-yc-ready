"""
SpecClaw Audit Pack & PDF Generation Engine
Generates official, signed PDF Deviation Closure Sheets for Purchase Order attachments.
"""

import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from typing import Dict, Any, List, Optional
from xml.sax.saxutils import escape

def generate_deviation_closure_pdf(
    tender_id: str,
    tender_title: str,
    vendor_name: str,
    negotiation_round: int,
    conceded_items: List[str],
    total_clawed_back: float,
    parameters: List[Dict[str, Any]],
    vendor_id: Optional[str] = None,
    headline_price: Optional[float] = None,
    total_adders: Optional[float] = None,
    open_adders: Optional[float] = None,
    buyer_name: Optional[str] = None,
    open_flags: int = 0,
) -> bytes:
    """Build the deviation closure sheet.

    The caller passes every money figure, computed for the negotiating vendor: its headline
    quote, its total deviation adders, the amount clawed back and the adders still open.
    A figure the caller does not know is printed as "not available", never as a sample value.
    """
    def money(value: Optional[float]) -> str:
        return f"€{value:,.0f}" if value is not None else "not available"

    if open_adders is None:
        price_note = ""
    elif open_adders > 0:
        price_note = f" ({money(open_adders)} adders open)"
    else:
        price_note = " (No Adders)"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#083344'),
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#475569')
    )
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0f172a')
    )
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#1e293b')
    )
    conceded_style = ParagraphStyle(
        'ConcededStyle',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#059669'),
        fontName='Helvetica-Bold'
    )

    elements = []

    # Title & Header
    elements.append(Paragraph("SPECCLAW AUDIT PACKET — TECHNICAL DEVIATION CLOSURE", title_style))
    elements.append(Paragraph(f"Tender: <b>{tender_id}</b> — {tender_title}", subtitle_style))
    if open_flags:
        # A sheet with unreviewed evidence is never presented as a signed, final closure.
        noun = "review flag" if open_flags == 1 else "review flags"
        status_line = f"DRAFT, Revision {negotiation_round}: {open_flags} {noun} open. Not a final result."
    else:
        status_line = f"Revision {negotiation_round} Signed Closure"
    elements.append(Paragraph(f"Vendor: <b>{vendor_name}</b> | Status: <b>{status_line}</b>", subtitle_style))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#06b6d4'), spaceAfter=10))

    # Executive Summary Banner
    summary_data = [
        [
            Paragraph("<b>Initial Headline Quote</b>", header_style),
            Paragraph("<b>Uncovered Technical Risk</b>", header_style),
            Paragraph("<b>Total Clawed-Back Value</b>", header_style),
            Paragraph("<b>Final Agreed Contract PO Price</b>", header_style)
        ],
        [
            Paragraph(money(headline_price), cell_style),
            Paragraph(money(total_adders), cell_style),
            Paragraph(f"<b>€{total_clawed_back:,.0f}</b>", conceded_style),
            Paragraph(f"<b>{money(headline_price)}{price_note}</b>", conceded_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[130, 130, 130, 140])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdf4')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#16a34a')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 14))

    # Table of Technical Queries & Scope Closures
    elements.append(Paragraph("<b>Itemized Technical Deviation & Concession Audit Register</b>", styles['Heading3']))
    elements.append(Spacer(1, 6))

    table_data = [
        [
            Paragraph("<b>Param ID & Name</b>", header_style),
            Paragraph("<b>MR Baseline Requirement</b>", header_style),
            Paragraph("<b>Vendor Initial Bid Snippet & BBox</b>", header_style),
            Paragraph("<b>Risk Adder</b>", header_style),
            Paragraph("<b>Final Concession Status</b>", header_style)
        ]
    ]

    for p in parameters:
        p_id = p["id"]
        v_data = p["vendors"].get(vendor_id, {}) if vendor_id else {}
        is_conceded = p_id in conceded_items
        adder = v_data.get("costAdder", 0)
        
        status_text = "<b>ABSORBED FREE BY VENDOR</b>" if is_conceded else "PENDING TQ"
        status_para = Paragraph(status_text, conceded_style if is_conceded else cell_style)

        table_data.append([
            Paragraph(f"<b>{p_id}</b><br/>{p['name']}", cell_style),
            Paragraph(p["mrRequirement"], cell_style),
            Paragraph(f"{v_data.get('extracted', '')}<br/><i>{v_data.get('bbox', '')}</i>", cell_style),
            Paragraph(f"€{adder:,.0f}", cell_style),
            status_para
        ])

    reg_table = Table(table_data, colWidths=[110, 110, 140, 65, 115])
    reg_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(reg_table)
    elements.append(Spacer(1, 20))

    # Signatures
    sig_data = [
        [
            Paragraph("<b>Authorized Vendor Sign-Off:</b>", cell_style),
            Paragraph("<b>Lead EPC Procurement Engineer:</b>", cell_style)
        ],
        [
            Paragraph(f"<br/><br/>_____________________________________<br/>{escape(vendor_name)} Tendering Lead", cell_style),
            Paragraph(f"<br/><br/>_____________________________________<br/>{escape(buyer_name or 'Buyer')} Strategic Sourcing Lead", cell_style)
        ]
    ]
    sig_table = Table(sig_data, colWidths=[265, 265])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(sig_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

