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
