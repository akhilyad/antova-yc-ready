"""
SpecClaw Pydantic V2 Multi-Model Contracts
Follows pydantic-models-py multi-model pattern (Base, Create, Update, Response, InDB).
"""

from typing import Dict, List, Literal, Optional, Any
from enum import Enum
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict

from specclaw_ingest.parse import TENDER_ID_PATTERN

class ComplianceStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    CONFLICT_DOWNGRADE = "CONFLICT_DOWNGRADE"
    DEVIATION_DOWNGRADE = "DEVIATION_DOWNGRADE"
    DEVIATION_UPGRADE = "DEVIATION_UPGRADE"
    OMITTED = "OMITTED"
    MANUAL_INSPECTION_REQUIRED = "MANUAL_INSPECTION_REQUIRED"

class Criticality(str, Enum):
    MANDATORY = "MANDATORY"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    COMMERCIAL = "COMMERCIAL"

class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

# --- EXTRACTED PARAMETER CONTRACTS ---
class ExtractedParameterBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    extracted_text: str = Field(..., description="Raw technical text extracted from document")
    status: ComplianceStatus = Field(..., description="Evaluated compliance status")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Extraction confidence score")
    bbox: str = Field(..., description="Coordinate bounding box [page, x0, y0, x1, y1]")
    snippet: str = Field(..., description="Verbatim source snippet")
    conflict_note: Optional[str] = Field(None, description="Note explaining hierarchy conflict or trap")
    cost_adder: float = Field(default=0.0, ge=0.0, description="Evaluated risk cost adder in EUR")
    adder_formula: str = Field(default="", description="Auditable unit rate calculation formula")

class ExtractedParameterCreate(ExtractedParameterBase):
    pass

class ExtractedParameterResponse(ExtractedParameterBase):
    pass

# --- ENGINEERING PARAMETER CONTRACTS ---
class EngineeringParameterBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: str = Field(..., description="Parameter identifier, e.g. PARAM-01")
    category: str = Field(..., description="Engineering domain category")
    name: str = Field(..., description="Technical parameter name")
    mr_requirement: str = Field(..., description="Buyer baseline requirement from Material Requisition")
    pint_rule: str = Field(..., description="Physical inequality rule for Pint evaluation")
    criticality: Criticality = Field(..., description="Parameter criticality grade")

class EngineeringParameterCreate(EngineeringParameterBase):
    vendors: Dict[str, ExtractedParameterCreate] = Field(..., description="Vendor extractions keyed by vendor ID")

class EngineeringParameterResponse(EngineeringParameterBase):
    vendors: Dict[str, ExtractedParameterResponse] = Field(..., description="Vendor extractions keyed by vendor ID")

# --- VENDOR CONTRACTS ---
class VendorBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: str = Field(..., description="Vendor identifier, e.g. vendor-a")
    name: str = Field(..., description="Vendor legal entity name")
    country: str = Field(..., description="Country of manufacture")
    headline_price: float = Field(..., ge=0.0, description="Base commercial bid quote in EUR")
    doc_name: str = Field(..., description="Submitted tender bid document filename")
    cover_claim: str = Field(..., description="Compliance assertion in cover letter")
    badge: str = Field(default="Bidder", description="Evaluation positioning badge")

class VendorCreate(VendorBase):
    pass

class VendorResponse(VendorBase):
    pass

# --- TENDER PACKAGE CONTRACTS ---
class TenderPackageBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    id: str = Field(..., description="Tender package identifier")
    title: str = Field(..., description="Tender project description")
    client: str = Field(..., description="Client EPC contractor entity")
    mr_doc: str = Field(..., description="Material Requisition reference file")
    pages_parsed: int = Field(default=0, ge=0)
    latency_sec: int = Field(default=0, ge=0)
    compute_cogs: float = Field(default=0.0, ge=0.0)

class TenderPackageCreate(TenderPackageBase):
    vendors: List[VendorCreate]
    parameters: List[EngineeringParameterCreate]

class TenderPackageResponse(TenderPackageBase):
    vendors: List[VendorResponse]
    parameters: List[EngineeringParameterResponse]

# --- SENSITIVITY & LEVELING CONTRACTS ---
class SensitivitySettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    copper_multiplier: float = Field(default=1.0, ge=0.5, le=2.5, description="LME Copper spot index multiplier")
    site_labor_rate: float = Field(default=60.0, ge=20.0, le=200.0, description="Site electrician hourly rate in EUR/hr")
    freight_multiplier: float = Field(default=1.0, ge=0.5, le=2.5, description="Heavy transport freight lane multiplier")

class EvaluateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    tender_id: str = Field(..., description="Tender package ID")
    copper_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)
    # Unset: the rate table's base labour rate.
    site_labor_rate: Optional[float] = Field(default=None, ge=20.0, le=200.0)
    freight_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)
    conceded_params: List[str] = Field(default_factory=list, description="List of parameter IDs conceded by bidder")
    vendor_id: Optional[str] = Field(default=None, description="Vendor the concessions apply to; unset: the lowest true evaluated price")

class ItemizedAdderResponse(BaseModel):
    param_id: str
    param_name: str
    status: str
    is_conceded: bool
    adder_eur: float
    criticality: str

class VendorFinancialResponse(BaseModel):
    vendor_id: str
    name: str
    country: str
    badge: str
    headline_price: float
    total_tech_penalty: float
    total_commercial_adder: float
    total_adders: float
    clawed_back_amount: float
    true_evaluated_price: float
    itemized_breakdown: List[ItemizedAdderResponse]

class LevelingSummaryResponse(BaseModel):
    clawback_value_eur: float
    specclaw_15pct_fee_eur: float
    net_epc_savings_eur: float

class EvaluateResponse(BaseModel):
    tender_id: str
    financials: List[VendorFinancialResponse]
    summary: LevelingSummaryResponse
    cached: bool = False
    evaluation_time_ms: float = 0.0

# --- BACKGROUND QUEUE JOBS & TELEMETRY ---
class IngestJobRequest(BaseModel):
    # Older UI builds also send document_count / ocr_mode; they are accepted and ignored.
    model_config = ConfigDict(extra="ignore")
    tender_id: str = Field(..., pattern=TENDER_ID_PATTERN, description="Tender folder under the tenders root")
    mode: Literal["replay", "auto", "live"] = Field(
        default="auto", description="replay: saved Claude responses only; auto: reuse or call; live: always call"
    )

class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress_pct: int
    stage: str
    created_at: str
    completed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

