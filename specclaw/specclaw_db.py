"""
SpecClaw Database & Repository Layer (schema v5)

- Tender-scoped keys: vendor and parameter IDs repeat across tenders, so they
  are keyed by (tender_id, id).
- Source documents record each ingested file's hash, role and page count.
- Structured fields (citations, checks, cost lines) are stored as JSON text.
- Each tender has a public share ID, a review status (DRAFT or VERIFIED) and
  the founder's adder overrides; re-ingesting resets it to DRAFT and clears them.
- init_db() upgrades the baseline schema in place: it drops the old extraction
  tables only if they are empty, and never touches the audit ledger. A v2
  database is upgraded to v3 in one transaction.
- v4 adds the run record (fingerprint and stage artifacts), the human review
  record, and an `extras` JSON column for cell and vendor fields added later.
  A v2 or v3 database is upgraded to v4 in one transaction.
- v5 adds `ingest_jobs`, so a job's status survives a restart. A v4 database is upgraded by
  creating the table in one transaction.
"""

import json
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional

from sqlalchemy import (
    Boolean, Column, Connection, DateTime, Engine, Float, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, create_engine, event, inspect, text,
)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

import specclaw_engine as engine_models

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("SPECCLAW_DATABASE_URL", "sqlite:///./specclaw_enterprise.db")
SCHEMA_VERSION = 5
LEGACY_TABLES = ("extracted_parameters", "parameters", "vendors", "tenders")
TENDER_STATUSES = ("DRAFT", "VERIFIED")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True, echo=False)

# Applied to every SQLite connection. SQLite ignores foreign keys unless asked per connection, so
# without this the ondelete rules in the models never fire. WAL lets a reader and the writer run
# together; busy_timeout makes a second writer wait up to 5 s instead of failing with "locked".
SQLITE_PRAGMAS = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA foreign_keys=ON",
    "PRAGMA busy_timeout=5000",
)


def configure_sqlite(bind: Engine) -> Engine:
    """Run SQLITE_PRAGMAS on every new connection of `bind`. Does nothing for other databases."""
    if bind.dialect.name == "sqlite":
        @event.listens_for(bind, "connect")
        def _pragmas(dbapi_connection, _record):
            cursor = dbapi_connection.cursor()
            try:
                for pragma in SQLITE_PRAGMAS:
                    cursor.execute(pragma)
            finally:
                cursor.close()
    return bind


configure_sqlite(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class LegacyDataError(RuntimeError):
    """The baseline-schema tables hold data, so they cannot be rebuilt automatically."""


class ForeignKeyViolation(RuntimeError):
    """Rows point at parents that do not exist. Foreign keys are enforced from now on, so the
    database has to be repaired (or the orphans deleted) before the service will start."""


# --- DATABASE MODELS ---

class SchemaVersionRecord(Base):
    __tablename__ = "schema_version"
    version = Column(Integer, primary_key=True)


class TenderRecord(Base):
    __tablename__ = "tenders"

    id = Column(String(64), primary_key=True)
    title = Column(String(255), nullable=False)
    client = Column(String(255), nullable=False)
    mr_doc = Column(String(255), nullable=False)
    equipment_class = Column(String(64), nullable=False, default="")
    rate_table_version = Column(String(64), nullable=False, default="")
    pages_parsed = Column(Integer, default=0)
    latency_sec = Column(Integer, default=0)
    compute_cogs = Column(Float, default=0.0)
    ingested_at = Column(DateTime, nullable=False)
    share_id = Column(String(32), nullable=False, unique=True, index=True)
    status = Column(String(16), nullable=False, default="DRAFT")
    verified_at = Column(DateTime, nullable=True)
    ingest_mode = Column(String(16), nullable=False, default="live")
    synthetic = Column(Boolean, nullable=False, default=False)
    ingest_stats = Column(Text, nullable=False, default="{}")
    stage_log = Column(Text, nullable=False, default="[]")


class AdderOverrideRecord(Base):
    """A founder's euro adder for one (parameter, vendor) cell of a tender."""
    __tablename__ = "adder_overrides"

    tender_id = Column(String(64), ForeignKey("tenders.id"), primary_key=True)
    param_id = Column(String(64), primary_key=True)
    vendor_id = Column(String(64), primary_key=True)
    adder_eur = Column(String(32), nullable=False)  # the Decimal's string, e.g. "12000.00"
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)


class SourceDocumentRecord(Base):
    __tablename__ = "source_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String(64), ForeignKey("tenders.id"), index=True, nullable=False)
    vendor_id = Column(String(64), nullable=True)
    filename = Column(String(255), nullable=False)
    sha256 = Column(String(64), nullable=False)
    role = Column(String(32), nullable=False)
    page_count = Column(Integer, nullable=False)
    pages_without_text = Column(Text, nullable=False, default="[]")


class VendorRecord(Base):
    __tablename__ = "vendors"

    tender_id = Column(String(64), ForeignKey("tenders.id"), primary_key=True)
    id = Column(String(64), primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String(255), nullable=False)
    country = Column(String(64), nullable=False)
    headline_price = Column(Float, nullable=False)
    headline_citation = Column(Text, nullable=True)
    doc_name = Column(String(255), nullable=False)
    cover_claim = Column(Text, nullable=False)
    badge = Column(String(64), nullable=False)
    extras = Column(Text, nullable=False, default="{}")  # JSON: the Vendor fields in VENDOR_EXTRAS


class ParameterRecord(Base):
    __tablename__ = "parameters"

    tender_id = Column(String(64), ForeignKey("tenders.id"), primary_key=True)
    id = Column(String(64), primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    category = Column(String(128), nullable=False)
    name = Column(String(255), nullable=False)
    mr_requirement = Column(Text, nullable=False)
    pint_rule = Column(Text, nullable=False)
    criticality = Column(String(32), nullable=False)
    requirement_citation = Column(Text, nullable=True)
    checks_spec = Column(Text, nullable=False, default="[]")

    __table_args__ = (Index("idx_param_tender_crit", "tender_id", "criticality"),)


class ExtractedParameterRecord(Base):
    __tablename__ = "extracted_parameters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String(64), ForeignKey("tenders.id"), index=True, nullable=False)
    parameter_id = Column(String(64), nullable=False)
    vendor_id = Column(String(64), nullable=False)
    extracted_text = Column(Text, nullable=False)
    status = Column(String(32), nullable=False)
    confidence = Column(Float, nullable=False)
    bbox = Column(String(255), nullable=False)
    snippet = Column(Text, nullable=False)
    conflict_note = Column(Text, nullable=True)
    cost_adder = Column(Float, default=0.0)
    adder_formula = Column(Text, default="")
    citation = Column(Text, nullable=True)
    secondary_citation = Column(Text, nullable=True)
    checks = Column(Text, nullable=False, default="[]")
    cost_lines = Column(Text, nullable=False, default="[]")
    pricing_status = Column(String(16), nullable=False, default="NONE")
    rate_table_version = Column(String(64), nullable=True)
    extras = Column(Text, nullable=False, default="{}")  # JSON: the cell fields in CELL_EXTRAS

    __table_args__ = (
        UniqueConstraint("tender_id", "parameter_id", "vendor_id", name="uq_extraction_cell"),
    )


class IngestRunRecord(Base):
    """One ingest run: what went in (the fingerprint and its parts)."""
    __tablename__ = "ingest_runs"

    run_id = Column(String(64), primary_key=True)
    tender_id = Column(String(64), ForeignKey("tenders.id"), index=True, nullable=False)
    fingerprint = Column(String(64), nullable=False)
    parts = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False)


class StageArtifactRecord(Base):
    """One stage's output for a run, as canonical JSON with its SHA-256."""
    __tablename__ = "stage_artifacts"

    run_id = Column(String(64), ForeignKey("ingest_runs.run_id"), primary_key=True)
    stage = Column(String(16), primary_key=True)
    sha256 = Column(String(64), nullable=False)
    body = Column(Text, nullable=False)


class CellReviewRecord(Base):
    """One human decision on one cell. Rows are only ever added; the latest per cell counts.

    A review sits on top of the extracted data and never changes it. `evidence_hash` is the
    hash of what the reviewer saw; when a re-ingest changes the cell, the review is stale.
    """
    __tablename__ = "cell_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String(64), ForeignKey("tenders.id"), index=True, nullable=False)
    param_id = Column(String(64), nullable=False)
    vendor_id = Column(String(64), nullable=False)
    action = Column(String(16), nullable=False)  # approve, override or reject
    reviewer = Column(String(128), nullable=False)
    note = Column(Text, nullable=False)
    evidence_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False)


class IngestJobRecord(Base):
    """One queued or finished ingest job. No foreign key: a tender may not exist until its first job ends."""
    __tablename__ = "ingest_jobs"

    job_id = Column(String(32), primary_key=True)
    tender_id = Column(String(64), nullable=False, index=True)
    mode = Column(String(16), nullable=False)
    status = Column(String(16), nullable=False, default="PENDING")
    progress_pct = Column(Integer, nullable=False, default=0)
    stage = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    result = Column(Text, nullable=True)  # JSON
    error = Column(Text, nullable=True)


class AuditLedgerRecord(Base):
    __tablename__ = "audit_clawback_ledger"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tender_id = Column(String(64), ForeignKey("tenders.id", ondelete="CASCADE"), index=True)
    negotiation_round = Column(Integer, nullable=False)
    vendor_id = Column(String(64), nullable=False)
    clawed_amount = Column(Float, nullable=False)
    performance_fee = Column(Float, nullable=False)
    net_savings = Column(Float, nullable=False)
    conceded_items = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_audit_tender_round", "tender_id", "negotiation_round"),
    )


# --- JSON helpers ---

def _dump(value: Any) -> Optional[str]:
    return None if value is None else json.dumps(value, default=str, ensure_ascii=False)


def _load(raw: Optional[str], default: Any = None) -> Any:
    return default if raw is None else json.loads(raw)


# Fields of engine.ExtractedParameter and engine.Vendor kept in the `extras` JSON column.
# A field named here must have a default on its model, so rows written before it existed load.
CELL_EXTRAS: tuple[str, ...] = ("flags", "evidence", "segments", "field_citations", "assembled_from")
VENDOR_EXTRAS: tuple[str, ...] = ("headline_status", "currency", "headline_original", "fx_rate", "fx_date")


def _extras(raw: Optional[str], names: tuple[str, ...]) -> dict:
    stored = _load(raw, {}) or {}
    return {name: stored[name] for name in names if name in stored}


def new_share_id() -> str:
    """A 22-character URL-safe random ID for a tender's public brief link."""
    return secrets.token_urlsafe(16)


@dataclass
class TenderMeta:
    """A tender's review and ingest metadata, without its parameters and extractions."""
    tender_id: str
    title: str
    share_id: str
    status: str
    verified_at: Optional[datetime]
    ingested_at: datetime
    ingest_mode: str
    synthetic: bool
    ingest_stats: dict
    stage_log: list[dict]


def _utc(value: Optional[datetime]) -> Optional[datetime]:
    """SQLite returns naive datetimes; every writer stores UTC, so naive means UTC."""
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


REVIEW_ACTIONS = ("approve", "override", "reject")


def _review(record: "CellReviewRecord") -> dict:
    return {"id": record.id, "tender_id": record.tender_id, "param_id": record.param_id,
            "vendor_id": record.vendor_id, "action": record.action, "reviewer": record.reviewer,
            "note": record.note, "evidence_hash": record.evidence_hash, "created_at": _utc(record.created_at)}


def _meta(record: TenderRecord) -> TenderMeta:
    return TenderMeta(
        tender_id=record.id, title=record.title, share_id=record.share_id, status=record.status,
        verified_at=_utc(record.verified_at), ingested_at=_utc(record.ingested_at), ingest_mode=record.ingest_mode,
        synthetic=record.synthetic, ingest_stats=_load(record.ingest_stats, {}), stage_log=_load(record.stage_log, []),
    )


# --- REPOSITORY ---

class TenderRepository:
    def __init__(self, db: Session):
        self.db = db

    def save_tender(
        self,
        tender: engine_models.TenderPackage,
        documents: list,
        ingested_at: datetime,
        *,
        ingest_mode: str = "live",
        synthetic: bool = False,
        ingest_stats: Optional[dict] = None,
        stage_log: Optional[list[dict]] = None,
        share_id: Optional[str] = None,
        run: Optional[dict] = None,
    ) -> None:
        """Replace everything stored for this tender in one transaction.

        The tender row is updated in place (never deleted) so audit-ledger rows
        that reference it are unaffected. It keeps its share ID (a new tender
        takes `share_id` if given, else a fresh one), goes back to DRAFT and
        loses its overrides, which were judgements about the previous ingest.

        `run` is {"run_id", "fingerprint", "parts", "artifacts": {stage: StageArtifact}}.
        The run row is kept; stage artifacts are kept for the tender's latest run only.
        """
        tid = tender.id
        try:
            for model in (ExtractedParameterRecord, ParameterRecord, VendorRecord, SourceDocumentRecord,
                          AdderOverrideRecord):
                self.db.query(model).filter(model.tender_id == tid).delete(synchronize_session=False)
            record = self.db.get(TenderRecord, tid) or TenderRecord(id=tid, share_id=share_id or new_share_id())
            record.title = tender.title
            record.client = tender.client
            record.mr_doc = tender.mr_doc
            record.equipment_class = tender.equipment_class
            record.rate_table_version = tender.rate_table_version
            record.pages_parsed = tender.pages_parsed
            record.latency_sec = tender.latency_sec
            record.compute_cogs = tender.compute_cogs
            record.ingested_at = ingested_at
            record.status = "DRAFT"
            record.verified_at = None
            record.ingest_mode = ingest_mode
            record.synthetic = synthetic
            record.ingest_stats = _dump(ingest_stats or {})
            record.stage_log = _dump(stage_log or [])
            self.db.add(record)
            # No relationship() links these tables, so SQLAlchemy does not order the inserts by foreign
            # key. Write the tender row first: every row below points at it.
            self.db.flush()
            for position, v in enumerate(tender.vendors):
                self.db.add(VendorRecord(
                    tender_id=tid, id=v.id, position=position, name=v.name, country=v.country,
                    # The column is NOT NULL from schema v2. An unknown price is stored as 0 and
                    # read back as null; no bid has a price of zero.
                    headline_price=v.headline_price or 0.0, headline_citation=_dump(v.headline_citation),
                    doc_name=v.doc_name, cover_claim=v.cover_claim, badge=v.badge,
                    extras=_dump({name: getattr(v, name) for name in VENDOR_EXTRAS}),
                ))
            for position, p in enumerate(tender.parameters):
                self.db.add(ParameterRecord(
                    tender_id=tid, id=p.id, position=position, category=p.category, name=p.name,
                    mr_requirement=p.mr_requirement, pint_rule=p.pint_rule, criticality=p.criticality.value,
                    requirement_citation=_dump(p.requirement_citation), checks_spec=_dump(p.checks_spec),
                ))
                for vendor_id, x in p.vendors.items():
                    self.db.add(ExtractedParameterRecord(
                        tender_id=tid, parameter_id=p.id, vendor_id=vendor_id,
                        extracted_text=x.extracted_text, status=x.status.value, confidence=x.confidence,
                        bbox=x.bbox, snippet=x.snippet, conflict_note=x.conflict_note,
                        cost_adder=x.cost_adder, adder_formula=x.adder_formula,
                        citation=_dump(x.citation), secondary_citation=_dump(x.secondary_citation),
                        checks=_dump(x.checks), cost_lines=_dump([line.model_dump() for line in x.cost_lines]),
                        pricing_status=x.pricing_status, rate_table_version=x.rate_table_version,
                        extras=_dump({name: getattr(x, name) for name in CELL_EXTRAS}),
                    ))
            if run is not None:
                self._save_run(tid, run, ingested_at)
            for d in documents:
                self.db.add(SourceDocumentRecord(
                    tender_id=tid, vendor_id=d.vendor_id, filename=d.filename, sha256=d.sha256,
                    role=d.role, page_count=d.page_count, pages_without_text=_dump(d.pages_without_text),
                ))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def _save_run(self, tender_id: str, run: dict, at: datetime) -> None:
        old = [r for (r,) in self.db.query(IngestRunRecord.run_id).filter(IngestRunRecord.tender_id == tender_id)]
        if old:
            self.db.query(StageArtifactRecord).filter(StageArtifactRecord.run_id.in_(old)).delete(
                synchronize_session=False)
        record = self.db.get(IngestRunRecord, run["run_id"]) or IngestRunRecord(run_id=run["run_id"])
        record.tender_id = tender_id
        record.fingerprint = run["fingerprint"]
        record.parts = _dump(run.get("parts") or {})
        record.created_at = at
        self.db.add(record)
        self.db.flush()
        for stage, artifact in (run.get("artifacts") or {}).items():
            self.db.add(StageArtifactRecord(run_id=run["run_id"], stage=stage, sha256=artifact.sha256,
                                            body=artifact.body))

    def get_run(self, tender_id: str) -> Optional[dict]:
        """The tender's latest run: its ID, fingerprint and the parts the fingerprint was built from."""
        record = (self.db.query(IngestRunRecord).filter(IngestRunRecord.tender_id == tender_id)
                  .order_by(IngestRunRecord.created_at.desc(), IngestRunRecord.run_id.desc()).first())
        if record is None:
            return None
        return {"run_id": record.run_id, "tender_id": record.tender_id, "fingerprint": record.fingerprint,
                "parts": _load(record.parts, {}), "created_at": _utc(record.created_at)}

    def get_stage_artifacts(self, run_id: str) -> dict:
        """stage -> StageArtifact for a run, in stage order; {} when none are stored."""
        from specclaw_ingest.artifacts import STAGE_NAMES, StageArtifact

        rows = {r.stage: r for r in self.db.query(StageArtifactRecord).filter(StageArtifactRecord.run_id == run_id)}
        return {stage: StageArtifact(stage, rows[stage].sha256, rows[stage].body)
                for stage in STAGE_NAMES if stage in rows}

    def load_tender(self, tender_id: str) -> Optional[engine_models.TenderPackage]:
        record = self.db.get(TenderRecord, tender_id)
        if record is None:
            return None
        extractions: dict = {}
        for x in self.db.query(ExtractedParameterRecord).filter(ExtractedParameterRecord.tender_id == tender_id):
            extractions.setdefault(x.parameter_id, {})[x.vendor_id] = engine_models.ExtractedParameter(
                extracted_text=x.extracted_text, status=x.status, confidence=x.confidence, bbox=x.bbox,
                snippet=x.snippet, conflict_note=x.conflict_note, cost_adder=x.cost_adder,
                adder_formula=x.adder_formula or "", cost_lines=_load(x.cost_lines, []),
                pricing_status=x.pricing_status, citation=_load(x.citation),
                secondary_citation=_load(x.secondary_citation), checks=_load(x.checks, []),
                rate_table_version=x.rate_table_version,
                **_extras(x.extras, CELL_EXTRAS),
            )
        vendors = (self.db.query(VendorRecord).filter(VendorRecord.tender_id == tender_id)
                   .order_by(VendorRecord.position).all())
        parameters = (self.db.query(ParameterRecord).filter(ParameterRecord.tender_id == tender_id)
                      .order_by(ParameterRecord.position).all())
        return engine_models.TenderPackage(
            id=record.id, title=record.title, client=record.client, mr_doc=record.mr_doc,
            pages_parsed=record.pages_parsed, latency_sec=record.latency_sec, compute_cogs=record.compute_cogs,
            equipment_class=record.equipment_class, rate_table_version=record.rate_table_version,
            vendors=[engine_models.Vendor(
                id=v.id, name=v.name, country=v.country, headline_price=v.headline_price or None,
                doc_name=v.doc_name, cover_claim=v.cover_claim, badge=v.badge,
                headline_citation=_load(v.headline_citation),
                **_extras(v.extras, VENDOR_EXTRAS),
            ) for v in vendors],
            parameters=[engine_models.EngineeringParameter(
                id=p.id, category=p.category, name=p.name, mr_requirement=p.mr_requirement,
                pint_rule=p.pint_rule, criticality=p.criticality, vendors=extractions.get(p.id, {}),
                requirement_citation=_load(p.requirement_citation), checks_spec=_load(p.checks_spec, []),
            ) for p in parameters],
        )

    def get_meta(self, tender_id: str) -> Optional[TenderMeta]:
        record = self.db.get(TenderRecord, tender_id)
        return _meta(record) if record else None

    def list_meta(self) -> List[TenderMeta]:
        """Every tender, newest ingest first; ties by tender ID."""
        query = self.db.query(TenderRecord).order_by(TenderRecord.ingested_at.desc(), TenderRecord.id.asc())
        return [_meta(r) for r in query]

    def tender_id_for_share(self, share_id: str) -> Optional[str]:
        return self.db.query(TenderRecord.id).filter(TenderRecord.share_id == share_id).scalar()

    def set_status(self, tender_id: str, status: str, at: datetime) -> None:
        """Verify (stamping `at`) or withdraw back to DRAFT (clearing the stamp)."""
        if status not in TENDER_STATUSES:
            raise ValueError(f"Unknown tender status {status!r}")
        record = self.db.get(TenderRecord, tender_id)
        if record is None:
            raise LookupError(f"Unknown tender {tender_id!r}")
        record.status = status
        record.verified_at = at if status == "VERIFIED" else None
        self.db.commit()

    def list_documents(self, tender_id: str) -> List[dict]:
        """The tender's source documents in ingest order."""
        rows = (self.db.query(SourceDocumentRecord).filter(SourceDocumentRecord.tender_id == tender_id)
                .order_by(SourceDocumentRecord.id))
        return [{"filename": d.filename, "role": d.role, "vendor_id": d.vendor_id, "page_count": d.page_count}
                for d in rows]

    def get_overrides(self, tender_id: str) -> dict[tuple[str, str], engine_models.Override]:
        """The tender's overrides keyed by (param_id, vendor_id)."""
        rows = self.db.query(AdderOverrideRecord).filter(AdderOverrideRecord.tender_id == tender_id)
        return {(o.param_id, o.vendor_id): engine_models.Override(adder_eur=Decimal(o.adder_eur), note=o.note)
                for o in rows}

    def put_override(self, tender_id: str, param_id: str, vendor_id: str, adder_eur: Decimal, note: str) -> None:
        """Create or replace the override for one cell; `created_at` records when it was last set."""
        record = (self.db.get(AdderOverrideRecord, (tender_id, param_id, vendor_id))
                  or AdderOverrideRecord(tender_id=tender_id, param_id=param_id, vendor_id=vendor_id))
        record.adder_eur = str(adder_eur)
        record.note = note
        record.created_at = datetime.now(timezone.utc)
        self.db.add(record)
        self.db.commit()

    def delete_override(self, tender_id: str, param_id: str, vendor_id: str) -> bool:
        """Remove one cell's override; False if there was none."""
        deleted = self.db.query(AdderOverrideRecord).filter(
            AdderOverrideRecord.tender_id == tender_id,
            AdderOverrideRecord.param_id == param_id,
            AdderOverrideRecord.vendor_id == vendor_id,
        ).delete(synchronize_session=False)
        self.db.commit()
        return deleted > 0

    def add_review(self, tender_id: str, param_id: str, vendor_id: str, *, action: str, reviewer: str,
                   note: str, evidence_hash: str) -> dict:
        """Record a reviewer's decision on a cell. Reviews survive a re-ingest (they go stale instead)."""
        if action not in REVIEW_ACTIONS:
            raise ValueError(f"Unknown review action {action!r}")
        record = CellReviewRecord(
            tender_id=tender_id, param_id=param_id, vendor_id=vendor_id, action=action, reviewer=reviewer,
            note=note, evidence_hash=evidence_hash, created_at=datetime.now(timezone.utc))
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return _review(record)

    def list_reviews(self, tender_id: str) -> List[dict]:
        """Every review of the tender, oldest first."""
        rows = (self.db.query(CellReviewRecord).filter(CellReviewRecord.tender_id == tender_id)
                .order_by(CellReviewRecord.id))
        return [_review(r) for r in rows]

    def latest_reviews(self, tender_id: str) -> dict[tuple[str, str], dict]:
        """The most recent review of each cell, keyed (param_id, vendor_id)."""
        return {(r["param_id"], r["vendor_id"]): r for r in self.list_reviews(tender_id)}

    # --- ingest jobs ---

    def create_job(self, job_id: str, tender_id: str, mode: str) -> dict:
        self.db.add(IngestJobRecord(job_id=job_id, tender_id=tender_id, mode=mode, status="PENDING",
                                    progress_pct=0, stage="Queued in worker pipeline",
                                    created_at=datetime.now(timezone.utc)))
        self.db.commit()
        return self.get_job(job_id)

    def update_job(self, job_id: str, *, status: Optional[str] = None, progress_pct: Optional[int] = None,
                   stage: Optional[str] = None, result: Optional[dict] = None, error: Optional[str] = None,
                   finished: bool = False) -> None:
        """Change the given fields of a job; `finished` stamps completed_at."""
        record = self.db.get(IngestJobRecord, job_id)
        if record is None:
            return
        if status is not None:
            record.status = status
        if progress_pct is not None:
            record.progress_pct = progress_pct
        if stage is not None:
            record.stage = stage
        if result is not None:
            record.result = _dump(result)
        if error is not None:
            record.error = error
        if finished:
            record.completed_at = datetime.now(timezone.utc)
        self.db.commit()

    def get_job(self, job_id: str) -> Optional[dict]:
        record = self.db.get(IngestJobRecord, job_id)
        if record is None:
            return None
        return {"job_id": record.job_id, "tender_id": record.tender_id, "mode": record.mode,
                "status": record.status, "progress_pct": record.progress_pct, "stage": record.stage,
                "created_at": _utc(record.created_at), "completed_at": _utc(record.completed_at),
                "result": _load(record.result), "error": record.error}

    def fail_unfinished_jobs(self, reason: str) -> int:
        """Mark every PENDING or PROCESSING job FAILED. For service start: such a job died with its process."""
        now = datetime.now(timezone.utc)
        rows = self.db.query(IngestJobRecord).filter(IngestJobRecord.status.in_(("PENDING", "PROCESSING"))).all()
        for record in rows:
            record.status, record.error, record.completed_at = "FAILED", reason, now
        self.db.commit()
        return len(rows)

    def log_negotiation_round(
        self,
        tender_id: str,
        round_num: int,
        vendor_id: str,
        clawed_amount: float,
        performance_fee: float,
        net_savings: float,
        conceded_items: List[str]
    ) -> AuditLedgerRecord:
        record = AuditLedgerRecord(
            tender_id=tender_id,
            negotiation_round=round_num,
            vendor_id=vendor_id,
            clawed_amount=clawed_amount,
            performance_fee=performance_fee,
            net_savings=net_savings,
            conceded_items=",".join(conceded_items)
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_audit_trail(self, tender_id: str) -> List[AuditLedgerRecord]:
        return (
            self.db.query(AuditLedgerRecord)
            .filter(AuditLedgerRecord.tender_id == tender_id)
            .order_by(AuditLedgerRecord.negotiation_round.asc())
            .all()
        )


def _current_version(bind: Engine, tables: set) -> Optional[int]:
    if "schema_version" not in tables:
        return None
    with bind.connect() as conn:
        return conn.execute(text("SELECT MAX(version) FROM schema_version")).scalar()


# Columns v3 adds to tenders, frozen as SQLite DDL. The SQL defaults fill rows that
# already exist (new rows get their values from the ORM); share_id is then set per row.
_V3_TENDER_COLUMNS = (
    "share_id VARCHAR(32) NOT NULL DEFAULT ''",
    "status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'",
    "verified_at DATETIME",
    "ingest_mode VARCHAR(16) NOT NULL DEFAULT 'live'",
    "synthetic BOOLEAN NOT NULL DEFAULT 0",
    "ingest_stats TEXT NOT NULL DEFAULT '{}'",
    "stage_log TEXT NOT NULL DEFAULT '[]'",
)


def _upgrade_v2_to_v3(conn: Connection) -> None:
    """Add the v3 tender columns, give each tender a share ID, create adder_overrides, record v3."""
    for column in _V3_TENDER_COLUMNS:
        conn.execute(text(f"ALTER TABLE tenders ADD COLUMN {column}"))
    for tender_id in conn.execute(text("SELECT id FROM tenders")).scalars().all():
        conn.execute(text("UPDATE tenders SET share_id = :sid WHERE id = :id"),
                     {"sid": new_share_id(), "id": tender_id})
    # SQLite's ALTER TABLE cannot add a UNIQUE constraint; this matches the index create_all makes.
    conn.execute(text("CREATE UNIQUE INDEX ix_tenders_share_id ON tenders (share_id)"))


def _upgrade_v3_to_v4(conn: Connection) -> None:
    """Add the extras columns; create the run, artifact and review tables; record v4."""
    inspector = inspect(conn)
    existing = set(inspector.get_table_names())
    for table in ("extracted_parameters", "vendors"):
        # A v2 database upgraded in this same transaction has no such table yet: create_all makes it whole.
        if table in existing and "extras" not in {c["name"] for c in inspector.get_columns(table)}:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN extras TEXT NOT NULL DEFAULT '{{}}'"))
    Base.metadata.create_all(bind=conn)
    _write_version(conn)


def _upgrade_v4_to_v5(conn: Connection) -> None:
    """Create ingest_jobs (and anything else missing) and record v5."""
    Base.metadata.create_all(bind=conn)
    _write_version(conn)


def _write_version(conn: Connection) -> None:
    conn.execute(text("DELETE FROM schema_version"))
    conn.execute(text("INSERT INTO schema_version (version) VALUES (:v)"), {"v": SCHEMA_VERSION})


# The ledger is a record of what was said in negotiation. Databases from before the v2 schema have
# ledger rows whose tender was never migrated; those rows are kept (never deleted), so they are
# reported, not fatal.
TOLERATED_ORPHANS = ("audit_clawback_ledger",)


def check_foreign_keys(bind: Engine) -> None:
    """Raise ForeignKeyViolation, naming the tables and counts, if a row has no parent (SQLite only).

    Orphans in TOLERATED_ORPHANS are logged as a warning instead.
    """
    if bind.dialect.name != "sqlite":
        return
    with bind.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
    counts: dict[str, int] = {}
    for table, *_ in rows:
        counts[table] = counts.get(table, 0) + 1
    for table in TOLERATED_ORPHANS:
        if table in counts:
            log.warning("%s has %d row(s) whose tender no longer exists; kept as history", table, counts.pop(table))
    if counts:
        detail = ", ".join(f"{table}: {n}" for table, n in sorted(counts.items()))
        raise ForeignKeyViolation(f"orphaned rows found ({detail}); fix or delete them before starting")


def init_db(bind: Optional[Engine] = None) -> None:
    """Create or upgrade the schema to the current version."""
    if bind is None:
        bind = engine
    elif bind is not engine:
        configure_sqlite(bind)  # an engine built elsewhere (a test, a script) gets the same pragmas
    tables = set(inspect(bind).get_table_names())
    version = _current_version(bind, tables)
    if version is not None and version >= SCHEMA_VERSION:
        Base.metadata.create_all(bind=bind)
        check_foreign_keys(bind)
        return
    if version in (2, 3):
        with bind.begin() as conn:
            if conn.dialect.name == "sqlite":
                # pysqlite only opens a transaction before DML; open it now so the ALTERs roll back too.
                conn.exec_driver_sql("BEGIN")
            if version == 2:
                _upgrade_v2_to_v3(conn)
            _upgrade_v3_to_v4(conn)
        check_foreign_keys(bind)
        return
    if version == 4:
        with bind.begin() as conn:
            _upgrade_v4_to_v5(conn)
        check_foreign_keys(bind)
        return
    legacy = [t for t in LEGACY_TABLES if t in tables]
    with bind.begin() as conn:
        for table in legacy:
            rows = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()
            if rows:
                raise LegacyDataError(
                    f"Table {table!r} uses the pre-v2 schema and holds {rows} rows; "
                    "back it up and empty it before upgrading."
                )
        for table in legacy:
            conn.execute(text(f'DROP TABLE "{table}"'))
    Base.metadata.create_all(bind=bind)
    with bind.begin() as conn:
        _write_version(conn)
    check_foreign_keys(bind)


def get_db():
    """FastAPI Dependency for database session management."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
