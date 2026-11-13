"""Database schema v3, migrations from the baseline and v2 schemas, and the repository."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

import specclaw_db
import specclaw_engine as engine
from specclaw_db import LegacyDataError, SCHEMA_VERSION, TenderRepository, init_db
from specclaw_ingest.types import SourceDocumentInfo

# Table definitions as created by the baseline specclaw_db.py (commit fbf1870).
LEGACY_SQL = [
    "CREATE TABLE tenders (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, client VARCHAR(255) NOT NULL, "
    "mr_doc VARCHAR(255) NOT NULL, pages_parsed INTEGER, latency_sec INTEGER, compute_cogs FLOAT, created_at DATETIME)",
    "CREATE TABLE vendors (id VARCHAR(64) PRIMARY KEY, tender_id VARCHAR(64) REFERENCES tenders (id) ON DELETE CASCADE, "
    "name VARCHAR(255) NOT NULL, country VARCHAR(64) NOT NULL, headline_price FLOAT NOT NULL, doc_name VARCHAR(255) NOT NULL, "
    "cover_claim TEXT NOT NULL, badge VARCHAR(64) NOT NULL)",
    "CREATE TABLE parameters (id VARCHAR(64) PRIMARY KEY, tender_id VARCHAR(64) REFERENCES tenders (id) ON DELETE CASCADE, "
    "category VARCHAR(128) NOT NULL, name VARCHAR(255) NOT NULL, mr_requirement TEXT NOT NULL, pint_rule VARCHAR(255) NOT NULL, "
    "criticality VARCHAR(32) NOT NULL)",
    "CREATE TABLE extracted_parameters (id INTEGER PRIMARY KEY AUTOINCREMENT, parameter_id VARCHAR(64), tender_id VARCHAR(64), "
    "vendor_id VARCHAR(64), extracted_text TEXT NOT NULL, status VARCHAR(32) NOT NULL, confidence FLOAT NOT NULL, "
    "bbox VARCHAR(128) NOT NULL, snippet TEXT NOT NULL, conflict_note TEXT, cost_adder FLOAT, adder_formula TEXT)",
    "CREATE TABLE audit_clawback_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, tender_id VARCHAR(64) REFERENCES tenders (id) "
    "ON DELETE CASCADE, negotiation_round INTEGER NOT NULL, vendor_id VARCHAR(64) NOT NULL, clawed_amount FLOAT NOT NULL, "
    "performance_fee FLOAT NOT NULL, net_savings FLOAT NOT NULL, conceded_items TEXT, created_at DATETIME)",
]

# Table definitions as created by specclaw_db.py at schema v2 (commit 82d0f82).
V2_SQL = [
    "CREATE TABLE schema_version (version INTEGER NOT NULL, PRIMARY KEY (version))",
    "CREATE TABLE tenders (id VARCHAR(64) NOT NULL, title VARCHAR(255) NOT NULL, client VARCHAR(255) NOT NULL, "
    "mr_doc VARCHAR(255) NOT NULL, equipment_class VARCHAR(64) NOT NULL, rate_table_version VARCHAR(64) NOT NULL, "
    "pages_parsed INTEGER, latency_sec INTEGER, compute_cogs FLOAT, ingested_at DATETIME NOT NULL, PRIMARY KEY (id))",
    "CREATE TABLE audit_clawback_ledger (id INTEGER NOT NULL, tender_id VARCHAR(64), "
    "negotiation_round INTEGER NOT NULL, vendor_id VARCHAR(64) NOT NULL, clawed_amount FLOAT NOT NULL, "
    "performance_fee FLOAT NOT NULL, net_savings FLOAT NOT NULL, conceded_items TEXT, created_at DATETIME, "
    "PRIMARY KEY (id), FOREIGN KEY(tender_id) REFERENCES tenders (id) ON DELETE CASCADE)",
    "INSERT INTO schema_version (version) VALUES (2)",
]
V3_TABLES = {"schema_version", "tenders", "source_documents", "vendors", "parameters",
             "extracted_parameters", "audit_clawback_ledger", "adder_overrides"}
V3_TENDER_COLUMNS = {"share_id", "status", "verified_at", "ingest_mode", "synthetic", "ingest_stats", "stage_log"}


@pytest.fixture
def db_engine(tmp_path):
    return create_engine(f"sqlite:///{(tmp_path / 't.db').as_posix()}")


def _legacy(db_engine):
    with db_engine.begin() as conn:
        for statement in LEGACY_SQL:
            conn.execute(text(statement))
        for round_num in (1, 2):
            conn.execute(text(
                "INSERT INTO audit_clawback_ledger (tender_id, negotiation_round, vendor_id, clawed_amount, "
                "performance_fee, net_savings, conceded_items) VALUES ('TENDER-2026-402', :r, 'vendor-b', 0, 0, 0, '')"
            ), {"r": round_num})


def _v2(db_engine):
    """A v2 database holding two tenders and two audit rows."""
    with db_engine.begin() as conn:
        for statement in V2_SQL:
            conn.execute(text(statement))
        for tender_id in ("TENDER-2026-402", "TENDER-2026-403"):
            conn.execute(text(
                "INSERT INTO tenders (id, title, client, mr_doc, equipment_class, rate_table_version, "
                "pages_parsed, latency_sec, compute_cogs, ingested_at) VALUES (:id, 'Title', 'Client', 'MR.pdf', "
                "'mv_gis_switchgear', 'mv_gis_switchgear_v1', 116, 3, 0.31, '2026-11-01 09:00:00.000000')"
            ), {"id": tender_id})
        for round_num in (1, 2):
            conn.execute(text(
                "INSERT INTO audit_clawback_ledger (tender_id, negotiation_round, vendor_id, clawed_amount, "
                "performance_fee, net_savings, conceded_items) VALUES ('TENDER-2026-402', :r, 'vendor-b', 1, 2, 3, 'x')"
            ), {"r": round_num})


def _tender_columns(db_engine):
    return {c["name"] for c in inspect(db_engine).get_columns("tenders")}


def _schema(db_engine, table):
    """Column names, types and nullability, plus indexes, as SQLite reports them."""
    inspector = inspect(db_engine)
    columns = {c["name"]: (str(c["type"]), c["nullable"]) for c in inspector.get_columns(table)}
    indexes = sorted((i["name"], tuple(i["column_names"]), bool(i["unique"])) for i in inspector.get_indexes(table))
    return columns, indexes


def _version(db_engine):
    with db_engine.connect() as conn:
        return conn.execute(text("SELECT version FROM schema_version")).scalar()


def _tender(tender_id="TENDER-T1"):
    line = engine.CostLine(label="Upgrade", qty=Decimal("11"), unit="bays", rate=Decimal("1600.00"), driver="fixed")
    cell = lambda status, adder: engine.ExtractedParameter(  # noqa: E731
        extracted_text="31.5 kA (1 s)", status=status, confidence=0.9, bbox="Page 11 (Drawing), BBox [1.0, 2.0, 3.0, 4.0]",
        snippet="NOTE 7", conflict_note="note", cost_adder=adder, adder_formula="11 bays × €1,600.00",
        cost_lines=[line] if adder else [], pricing_status="PRICED" if adder else "NONE",
        citation={"filename": "b.pdf", "page": 11, "bbox": [1.0, 2.0, 3.0, 4.0], "quote": "NOTE 7", "section": "drawing"},
        secondary_citation=None,
        checks=[{"field": "ik", "operator": "ge", "required": "50 kA", "offered": "31.5 kA",
                 "offered_canonical": "31.5 kA", "passed": False, "citation_ref": "b.pdf#p11"}],
        rate_table_version="mv_gis_switchgear_v1",
    )
    return engine.TenderPackage(
        id=tender_id, title="Title", client="Client", mr_doc="MR.pdf (26 pages)", pages_parsed=116, latency_sec=3,
        compute_cogs=0.31, equipment_class="mv_gis_switchgear", rate_table_version="mv_gis_switchgear_v1",
        vendors=[
            engine.Vendor(id="vendor-b", name="VoltSwitch", country="TR", headline_price=418000.0, doc_name="b.pdf",
                          cover_claim="claim", badge="Apparent Low Bidder",
                          headline_citation={"filename": "b.pdf", "page": 22, "bbox": [1.0, 2.0, 3.0, 4.0],
                                             "quote": "€418,000", "section": "commercial"}),
            engine.Vendor(id="vendor-a", name="Nordwerk", country="DE", headline_price=452000.0, doc_name="a.pdf",
                          cover_claim="claim", badge="Compliant Baseline"),
        ],
        parameters=[engine.EngineeringParameter(
            id="PARAM-01", category="Electrical", name="Ik", mr_requirement="50 kA for 3 s",
            pint_rule="Ik ≥ 50 kA AND t ≥ 3 s", criticality=engine.Criticality.MANDATORY,
            requirement_citation={"filename": "MR.pdf", "page": 5, "bbox": [1.0, 2.0, 3.0, 4.0], "quote": "q", "section": "mr_spec"},
            checks_spec=[{"field": "ik", "operator": "ge", "label": "Ik", "required": "50 kA"}],
            vendors={"vendor-b": cell(engine.ComplianceStatus.CONFLICT_DOWNGRADE, 18500.0),
                     "vendor-a": cell(engine.ComplianceStatus.COMPLIANT, 0.0)},
        )],
    )


DOCS = [SourceDocumentInfo("MR.pdf", "mr_spec", None, "abc", 26, []),
        SourceDocumentInfo("b.pdf", "vendor_bid", "vendor-b", "def", 30, [4])]


def _counts(db_engine):
    with db_engine.connect() as conn:
        return {t: conn.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar()
                for t in ("tenders", "vendors", "parameters", "extracted_parameters", "source_documents")}


def test_v3_fresh_init_has_new_columns(db_engine):
    init_db(db_engine)
    assert V3_TABLES <= set(inspect(db_engine).get_table_names())
    assert V3_TENDER_COLUMNS <= _tender_columns(db_engine)
    assert _version(db_engine) == SCHEMA_VERSION == 6


def test_upgrade_keeps_audit_rows(db_engine):
    _legacy(db_engine)
    init_db(db_engine)
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM audit_clawback_ledger")).scalar() == 2
    columns = {c["name"] for c in inspect(db_engine).get_columns("vendors")}
    assert "headline_citation" in columns
    assert V3_TENDER_COLUMNS <= _tender_columns(db_engine)
    assert _version(db_engine) == 6


def test_upgrade_refuses_nonempty_legacy(db_engine):
    _legacy(db_engine)
    with db_engine.begin() as conn:
        conn.execute(text("INSERT INTO parameters VALUES ('PARAM-01', 'T', 'c', 'n', 'r', 'rule', 'MANDATORY')"))
    with pytest.raises(LegacyDataError, match="parameters"):
        init_db(db_engine)
    tables = set(inspect(db_engine).get_table_names())
    assert {"parameters", "tenders", "vendors", "extracted_parameters"} <= tables
    assert "schema_version" not in tables


def test_v2_upgrade_adds_columns_and_backfills_share_id(db_engine):
    _v2(db_engine)
    init_db(db_engine)
    with db_engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, share_id, status, verified_at, ingest_mode, synthetic, ingest_stats, stage_log "
            "FROM tenders ORDER BY id"
        )).all()
        ledger = conn.execute(text(
            "SELECT tender_id, negotiation_round, clawed_amount, performance_fee, net_savings, conceded_items "
            "FROM audit_clawback_ledger ORDER BY id"
        )).all()
    share_ids = [row.share_id for row in rows]
    assert [len(sid) for sid in share_ids] == [22, 22] and share_ids[0] != share_ids[1]
    assert {tuple(row)[2:] for row in rows} == {("DRAFT", None, "live", 0, "{}", "[]")}
    assert [tuple(row) for row in ledger] == [("TENDER-2026-402", 1, 1.0, 2.0, 3.0, "x"),
                                              ("TENDER-2026-402", 2, 1.0, 2.0, 3.0, "x")]
    assert "adder_overrides" in inspect(db_engine).get_table_names()
    assert _version(db_engine) == 6
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        assert repo.tender_id_for_share(share_ids[0]) == "TENDER-2026-402"
        assert repo.get_meta("TENDER-2026-402").stage_log == []


def test_v2_upgrade_matches_fresh_schema(tmp_path):
    fresh = create_engine(f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}")
    migrated = create_engine(f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}")
    init_db(fresh)
    _v2(migrated)
    init_db(migrated)
    assert _schema(migrated, "tenders") == _schema(fresh, "tenders")
    assert ("ix_tenders_share_id", ("share_id",), True) in _schema(fresh, "tenders")[1]
    assert _schema(migrated, "adder_overrides") == _schema(fresh, "adder_overrides")


def test_v2_upgrade_is_all_or_nothing(db_engine, monkeypatch):
    _v2(db_engine)

    def fail():
        raise RuntimeError("share id generator failed")

    monkeypatch.setattr(specclaw_db, "new_share_id", fail)
    with pytest.raises(RuntimeError, match="share id generator failed"):
        init_db(db_engine)
    assert V3_TENDER_COLUMNS.isdisjoint(_tender_columns(db_engine))
    assert "adder_overrides" not in inspect(db_engine).get_table_names()
    assert _version(db_engine) == 2
    monkeypatch.undo()
    init_db(db_engine)
    assert _version(db_engine) == 6


def test_init_is_idempotent(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        TenderRepository(session).save_tender(_tender(), DOCS, datetime.now(timezone.utc))
    init_db(db_engine)
    assert _counts(db_engine)["vendors"] == 2
    assert _version(db_engine) == 6


def test_round_trip(db_engine):
    init_db(db_engine)
    original = _tender()
    with Session(db_engine) as session:
        TenderRepository(session).save_tender(original, DOCS, datetime.now(timezone.utc))
    with Session(db_engine) as session:
        loaded = TenderRepository(session).load_tender("TENDER-T1")
    assert loaded.model_dump() == original.model_dump()
    assert [v.id for v in loaded.vendors] == ["vendor-b", "vendor-a"]


def test_load_missing_tender_is_none(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        assert TenderRepository(session).load_tender("TENDER-NOPE") is None


def test_save_twice_replaces(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        first = _counts(db_engine)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
    assert _counts(db_engine) == first == {"tenders": 1, "vendors": 2, "parameters": 1,
                                           "extracted_parameters": 2, "source_documents": 2}


def test_audit_trail_survives_resave(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        repo.log_negotiation_round("TENDER-T1", 2, "vendor-b", 33900.0, 5085.0, 28815.0, ["PARAM-01"])
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        assert len(repo.get_audit_trail("TENDER-T1")) == 1


def test_save_keeps_share_id_and_resets_to_draft(db_engine):
    init_db(db_engine)
    now = datetime.now(timezone.utc)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, now)
        repo.save_tender(_tender("TENDER-T2"), DOCS, now)
        share_id = repo.get_meta("TENDER-T1").share_id
        repo.set_status("TENDER-T1", "VERIFIED", now)
        repo.put_override("TENDER-T1", "PARAM-01", "vendor-b", Decimal("12000.00"), "engineer estimate")
        repo.put_override("TENDER-T2", "PARAM-01", "vendor-b", Decimal("500.00"), "other tender")
        verified = repo.get_meta("TENDER-T1")
        assert (verified.status, verified.verified_at is None) == ("VERIFIED", False)

        repo.save_tender(_tender(), DOCS, now, share_id="ignored-for-an-existing-tender")
        meta = repo.get_meta("TENDER-T1")
        assert (meta.share_id, meta.status, meta.verified_at) == (share_id, "DRAFT", None)
        assert repo.get_overrides("TENDER-T1") == {}
        assert list(repo.get_overrides("TENDER-T2")) == [("PARAM-01", "vendor-b")]


def test_save_with_fixed_share_id(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc), share_id="e2e-sample-share-id-000000")
        assert repo.tender_id_for_share("e2e-sample-share-id-000000") == "TENDER-T1"
        assert repo.tender_id_for_share("no-such-share-id") is None


def test_meta_round_trip(db_engine):
    init_db(db_engine)
    now = datetime.now(timezone.utc)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        assert repo.get_meta("TENDER-NEW") is None
        assert repo.list_meta() == []
        repo.save_tender(_tender("TENDER-OLD"), DOCS, now - timedelta(hours=1))
        repo.save_tender(_tender("TENDER-NEW"), DOCS, now, ingest_mode="answer_key", synthetic=True,
                         ingest_stats={"pages_parsed": 116}, stage_log=[{"stage": "Intake", "pct": 5, "t_ms": 3}])
        new, old = repo.get_meta("TENDER-NEW"), repo.get_meta("TENDER-OLD")
        assert repo.list_meta() == [new, old]
    assert isinstance(new, specclaw_db.TenderMeta)
    assert (new.tender_id, new.title, new.status, new.verified_at) == ("TENDER-NEW", "Title", "DRAFT", None)
    assert new.ingested_at.replace(tzinfo=None) == now.replace(tzinfo=None)
    assert (new.ingest_mode, new.synthetic, new.ingest_stats, new.stage_log) == (
        "answer_key", True, {"pages_parsed": 116}, [{"stage": "Intake", "pct": 5, "t_ms": 3}])
    assert (old.ingest_mode, old.synthetic, old.ingest_stats, old.stage_log) == ("live", False, {}, [])
    assert len(new.share_id) == len(old.share_id) == 22 and new.share_id != old.share_id


def test_list_meta_breaks_ties_on_tender_id(db_engine):
    """Newest ingest first; tenders ingested at the same instant list by tender ID."""
    init_db(db_engine)
    at = datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        for tender_id in ("TENDER-T3", "TENDER-T1", "TENDER-T2"):
            repo.save_tender(_tender(tender_id), DOCS, at)
        repo.save_tender(_tender("TENDER-T0"), DOCS, at - timedelta(hours=1))
        assert [m.tender_id for m in repo.list_meta()] == ["TENDER-T1", "TENDER-T2", "TENDER-T3", "TENDER-T0"]


def test_set_status_verify_and_withdraw(db_engine):
    init_db(db_engine)
    at = datetime(2026, 11, 5, 12, 30, tzinfo=timezone.utc)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        repo.set_status("TENDER-T1", "VERIFIED", at)
        meta = repo.get_meta("TENDER-T1")
        assert (meta.status, meta.verified_at) == ("VERIFIED", at)
        repo.set_status("TENDER-T1", "DRAFT", at)
        meta = repo.get_meta("TENDER-T1")
        assert (meta.status, meta.verified_at) == ("DRAFT", None)
        with pytest.raises(ValueError, match="PUBLISHED"):
            repo.set_status("TENDER-T1", "PUBLISHED", at)
        with pytest.raises(LookupError, match="TENDER-NOPE"):
            repo.set_status("TENDER-NOPE", "VERIFIED", at)


def test_meta_timestamps_are_utc_aware(db_engine):
    """SQLite drops tzinfo; every writer stores UTC, so the repository hands the timestamps back as UTC."""
    init_db(db_engine)
    at = datetime(2026, 11, 5, 9, 30, tzinfo=timezone.utc)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc))
        repo.set_status("TENDER-T1", "VERIFIED", at)
        meta = repo.get_meta("TENDER-T1")
    assert meta.ingested_at == datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)
    assert meta.verified_at == at
    assert meta.ingested_at.utcoffset() == meta.verified_at.utcoffset() == timedelta(0)


def test_list_documents(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        assert repo.list_documents("TENDER-T1") == [
            {"filename": "MR.pdf", "role": "mr_spec", "vendor_id": None, "page_count": 26},
            {"filename": "b.pdf", "role": "vendor_bid", "vendor_id": "vendor-b", "page_count": 30},
        ]
        assert repo.list_documents("TENDER-NOPE") == []


def test_overrides_round_trip(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        repo.put_override("TENDER-T1", "PARAM-01", "vendor-b", Decimal("12000.00"), "engineer estimate")
        overrides = repo.get_overrides("TENDER-T1")
        assert overrides == {("PARAM-01", "vendor-b"): engine.Override(adder_eur=Decimal("12000.00"),
                                                                       note="engineer estimate")}
        assert str(overrides[("PARAM-01", "vendor-b")].adder_eur) == "12000.00"
        repo.put_override("TENDER-T1", "PARAM-01", "vendor-b", Decimal("9500.50"), "revised quote")
        assert repo.get_overrides("TENDER-T1") == {("PARAM-01", "vendor-b"): engine.Override(
            adder_eur=Decimal("9500.50"), note="revised quote")}
        assert repo.delete_override("TENDER-T1", "PARAM-01", "vendor-b") is True
        assert repo.delete_override("TENDER-T1", "PARAM-01", "vendor-b") is False
        assert repo.get_overrides("TENDER-T1") == {}


# --- schema v4: run record, stage artifacts, extras ----------------------------------------------

V4_TABLES = {"ingest_runs", "stage_artifacts"}


def _v3(db_engine):
    """A v3 database holding one tender: a fresh schema with the v4 additions taken out again."""
    init_db(db_engine)
    with Session(db_engine) as session:
        TenderRepository(session).save_tender(_tender(), DOCS, datetime.now(timezone.utc))
    with db_engine.begin() as conn:
        for table in ("stage_artifacts", "ingest_runs", "cell_reviews"):
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}"'))
        for table in ("extracted_parameters", "vendors"):
            conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN extras'))
        conn.execute(text('ALTER TABLE adder_overrides DROP COLUMN evidence_hash'))
        conn.execute(text("DROP TABLE IF EXISTS ingest_jobs"))
        conn.execute(text("UPDATE schema_version SET version = 3"))


def test_v4_fresh_init_has_run_tables_and_extras(db_engine):
    init_db(db_engine)
    assert V4_TABLES <= set(inspect(db_engine).get_table_names())
    for table in ("extracted_parameters", "vendors"):
        assert "extras" in {c["name"] for c in inspect(db_engine).get_columns(table)}


def test_v3_upgrade_keeps_the_tender_and_adds_v4(db_engine):
    _v3(db_engine)
    before = _counts(db_engine)
    init_db(db_engine)
    assert _version(db_engine) == 6
    assert _counts(db_engine) == before
    assert V4_TABLES <= set(inspect(db_engine).get_table_names())
    with Session(db_engine) as session:
        loaded = TenderRepository(session).load_tender(_tender().id)
    assert loaded == _tender()


def test_v3_upgrade_matches_fresh_schema(tmp_path):
    fresh = create_engine(f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}")
    migrated = create_engine(f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}")
    init_db(fresh)
    _v3(migrated)
    init_db(migrated)
    for table in ("extracted_parameters", "vendors", "ingest_runs", "stage_artifacts"):
        assert _schema(migrated, table)[0] == _schema(fresh, table)[0], table


# --- SQLite pragmas and the foreign-key check -----------------------------------------------------

def _pragma(engine, name):
    with engine.connect() as conn:
        return conn.exec_driver_sql(f"PRAGMA {name}").scalar()


def test_sqlite_connections_get_wal_foreign_keys_and_busy_timeout(db_engine):
    init_db(db_engine)
    assert _pragma(db_engine, "journal_mode") == "wal"
    assert _pragma(db_engine, "foreign_keys") == 1
    assert _pragma(db_engine, "busy_timeout") == 5000
    assert _pragma(db_engine, "synchronous") == 1  # NORMAL


def test_the_app_engine_uses_the_same_pragmas():
    import specclaw_db

    assert _pragma(specclaw_db.engine, "foreign_keys") == 1
    assert _pragma(specclaw_db.engine, "journal_mode") == "wal"


def test_a_row_without_a_parent_is_refused(db_engine):
    from sqlalchemy.exc import IntegrityError

    init_db(db_engine)
    with pytest.raises(IntegrityError):
        with db_engine.begin() as conn:
            conn.execute(text("INSERT INTO ingest_runs (run_id, tender_id, fingerprint, parts, created_at) "
                              "VALUES ('r1', 'NO-SUCH-TENDER', 'f', '{}', '2026-01-01')"))


def test_init_db_refuses_to_start_on_orphaned_rows(db_engine):
    from specclaw_db import ForeignKeyViolation

    init_db(db_engine)
    with db_engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")  # how an old, unenforced database got its orphans
        conn.execute(text("INSERT INTO ingest_runs (run_id, tender_id, fingerprint, parts, created_at) "
                          "VALUES ('r1', 'NO-SUCH-TENDER', 'f', '{}', '2026-01-01')"))
    with pytest.raises(ForeignKeyViolation, match="ingest_runs: 1"):
        init_db(db_engine)


# --- schema v5: durable ingest jobs --------------------------------------------------------------

def test_v4_upgrade_adds_ingest_jobs_and_keeps_the_tender(db_engine):
    init_db(db_engine)
    TenderRepository(sessionmaker(bind=db_engine)()).save_tender(_tender(), [], datetime.now(timezone.utc))
    with db_engine.begin() as conn:
        conn.execute(text("DROP TABLE ingest_jobs"))
        conn.execute(text("DELETE FROM schema_version"))
        conn.execute(text("INSERT INTO schema_version (version) VALUES (4)"))
    assert "ingest_jobs" not in inspect(db_engine).get_table_names()
    init_db(db_engine)
    assert _version(db_engine) == 6
    assert "ingest_jobs" in inspect(db_engine).get_table_names()
    assert TenderRepository(sessionmaker(bind=db_engine)()).get_meta("TENDER-T1") is not None


def test_job_round_trip_and_unfinished_sweep(db_engine):
    init_db(db_engine)
    repo = TenderRepository(sessionmaker(bind=db_engine)())
    job = repo.create_job("job-a", "TENDER-X", "replay")  # no such tender yet: allowed
    assert (job["status"], job["progress_pct"]) == ("PENDING", 0)
    repo.update_job("job-a", status="PROCESSING", progress_pct=60, stage="Price")
    repo.update_job("job-a", status="COMPLETED", progress_pct=100, finished=True, result={"n": 1})
    done = repo.get_job("job-a")
    assert done["result"] == {"n": 1} and done["completed_at"] is not None
    repo.create_job("job-b", "TENDER-X", "live")
    assert repo.fail_unfinished_jobs("gone") == 1
    assert repo.get_job("job-b")["error"] == "gone"
    assert repo.get_job("job-a")["status"] == "COMPLETED"


# --- schema v6: override evidence hash -----------------------------------------------------------

def test_v3_upgrade_adds_the_override_hash_column(db_engine):
    _v3(db_engine)
    init_db(db_engine)
    assert "evidence_hash" in {c["name"] for c in inspect(db_engine).get_columns("adder_overrides")}
    assert _version(db_engine) == 6


def test_v5_upgrade_adds_the_override_hash_column_and_keeps_overrides(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        repo.put_override("TENDER-T1", "PARAM-01", "vendor-b", Decimal("12000.00"), "engineer estimate")
    with db_engine.begin() as conn:
        conn.execute(text("ALTER TABLE adder_overrides DROP COLUMN evidence_hash"))
        conn.execute(text("UPDATE schema_version SET version = 5"))
    init_db(db_engine)
    assert _version(db_engine) == 6
    with Session(db_engine) as session:
        overrides = TenderRepository(session).get_overrides("TENDER-T1")
    assert overrides[("PARAM-01", "vendor-b")].adder_eur == Decimal("12000.00")
    with db_engine.connect() as conn:
        assert conn.execute(text("SELECT evidence_hash FROM adder_overrides")).scalar() is None


def test_overrides_without_a_hash_are_cleared_by_the_next_save(db_engine):
    init_db(db_engine)
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        repo.put_override("TENDER-T1", "PARAM-01", "vendor-b", Decimal("12000.00"), "engineer estimate")
        cleared = repo.save_tender(_tender(), DOCS, datetime.now(timezone.utc))
        assert cleared == [{"param_id": "PARAM-01", "vendor_id": "vendor-b",
                            "adder_eur": "12000.00", "note": "engineer estimate"}]
        assert repo.get_overrides("TENDER-T1") == {}
