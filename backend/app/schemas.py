from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class SchedulePreference(str, Enum):
    packed = "packed"
    balanced = "balanced"
    chill = "chill"


class WakePreference(str, Enum):
    early = "early"
    normal = "normal"
    late = "late"


INTEREST_KEYS = ["food", "nightlife", "culture", "outdoors", "relaxation"]
MAX_TRIP_DAYS = 30


class InterestVector(BaseModel):
    food: float = Field(ge=0, le=5)
    nightlife: float = Field(ge=0, le=5)
    culture: float = Field(ge=0, le=5)
    outdoors: float = Field(ge=0, le=5)
    relaxation: float = Field(ge=0, le=5)

    def as_dict(self) -> Dict[str, float]:
        return {k: float(getattr(self, k)) for k in INTEREST_KEYS}


class CreateTripRequest(BaseModel):
    destination: str = Field(min_length=2)
    start_date: date
    end_date: date
    accommodation_address: str
    accommodation_lat: float
    accommodation_lng: float

    @field_validator("end_date")
    @classmethod
    def validate_dates(cls, v: date, info):
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        if start and ((v - start).days + 1) > MAX_TRIP_DAYS:
            raise ValueError(f"trip length must be at most {MAX_TRIP_DAYS} days")
        return v

    @field_validator("accommodation_lat")
    @classmethod
    def validate_latitude(cls, v: float):
        if not -90 <= v <= 90:
            raise ValueError("accommodation_lat must be between -90 and 90")
        return v

    @field_validator("accommodation_lng")
    @classmethod
    def validate_longitude(cls, v: float):
        if not -180 <= v <= 180:
            raise ValueError("accommodation_lng must be between -180 and 180")
        return v


class ParticipantInput(BaseModel):
    name: str = Field(min_length=1)
    interest_vector: InterestVector
    schedule_preference: SchedulePreference
    wake_preference: WakePreference


class Participant(ParticipantInput):
    trip_id: str


class Trip(BaseModel):
    id: str
    destination: str
    start_date: date
    end_date: date
    accommodation_address: str = ""
    accommodation_lat: float
    accommodation_lng: float
    participants: List[Participant] = Field(default_factory=list)


class TripCreateResponse(Trip):
    owner_token: str
    join_code: str


class Activity(BaseModel):
    name: str
    category: str
    rating: float
    price_level: int
    latitude: float
    longitude: float
    typical_visit_duration: int
    explanation: Optional[str] = None
    image_url: Optional[str] = None
    activity_url: Optional[str] = None
    estimated_price: Optional[str] = None
    price_confidence: Optional[str] = None
    group_fit_score: Optional[float] = None
    conflict_summary: Optional[str] = None


class DayPlan(BaseModel):
    day: int
    morning_activity: Optional[Activity] = None
    afternoon_activity: Optional[Activity] = None
    dinner: Optional[Activity] = None
    evening_option: Optional[Activity] = None


class ItineraryOption(BaseModel):
    name: str
    style: str
    group_match_score: float
    explanation: str
    days: List[DayPlan]


class ItineraryResult(BaseModel):
    trip_id: str
    generated_at: str
    options: List[ItineraryOption]


class JoinTripRequest(ParticipantInput):
    pass


class GeocodeCandidate(BaseModel):
    address: str
    lat: float
    lng: float
    provider: str
    confidence: float


class GeocodeResponse(BaseModel):
    query: str
    results: List[GeocodeCandidate]


class DraftSlotName(str, Enum):
    morning = "morning"
    afternoon = "afternoon"
    evening = "evening"


class DraftSlot(BaseModel):
    slot_id: str
    day: int
    slot: DraftSlotName
    candidates: List[Activity]


class DraftSchedule(BaseModel):
    trip_id: str
    generated_at: str
    slots: List[DraftSlot]


class DraftSelection(BaseModel):
    slot_id: str
    day: int
    slot: DraftSlotName
    activity: Activity


class PlanningSettings(BaseModel):
    daily_budget_per_person: float = Field(default=120, ge=0, le=5000)
    max_transfer_minutes: int = Field(default=45, ge=5, le=240)
    dietary_notes: str = Field(default="", max_length=250)
    mobility_notes: str = Field(default="", max_length=250)
    must_do_places: List[str] = Field(default_factory=list, max_length=20)
    avoid_places: List[str] = Field(default_factory=list, max_length=20)


class DraftSlotFeedback(BaseModel):
    slot_id: str
    candidate_name: str
    votes: int = Field(default=0, ge=0, le=999)
    vetoed: bool = False


class DraftPlanMetadata(BaseModel):
    planning_settings: PlanningSettings = Field(default_factory=PlanningSettings)
    slot_feedback: List[DraftSlotFeedback] = Field(default_factory=list)
    selection_coverage_ratio: float = Field(default=0, ge=0, le=1)
    shared_token: Optional[str] = None
    shared_count: int = Field(default=0, ge=0)
    shared_at: Optional[str] = None


class DraftPlanSaveRequest(BaseModel):
    selections: List[DraftSelection] = Field(min_length=1)
    planning_settings: Optional[PlanningSettings] = None
    slot_feedback: List[DraftSlotFeedback] = Field(default_factory=list)


class DraftPlan(BaseModel):
    trip_id: str
    saved_at: str
    selections: List[DraftSelection]
    metadata: DraftPlanMetadata = Field(default_factory=DraftPlanMetadata)


class DraftValidationDay(BaseModel):
    day: int
    estimated_cost_per_person: str
    estimated_cost_value: float
    transfer_minutes_total: int
    max_leg_minutes: int
    warnings: List[str] = Field(default_factory=list)
    route_map_url: Optional[str] = None


class DraftValidationReport(BaseModel):
    trip_id: str
    generated_at: str
    day_count: int
    total_estimated_cost_per_person: float
    days: List[DraftValidationDay]
    warnings: List[str] = Field(default_factory=list)


class ShareDraftPlanResponse(BaseModel):
    share_token: str
    share_url: str


class SharedDraftPlanResponse(BaseModel):
    trip_id: str
    destination: str
    start_date: date
    end_date: date
    accommodation_address: str
    draft_plan: DraftPlan
    validation: DraftValidationReport


class AnalyticsSummary(BaseModel):
    total_trips: int
    trips_with_saved_draft: int
    pct_trips_with_saved_draft: float
    saved_drafts: int
    saved_drafts_full_slots: int
    pct_saved_drafts_full_slots: float
    saved_drafts_shared: int
    pct_saved_drafts_shared: float
