from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
import os
import secrets
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from . import models  # noqa: F401
from .db import Base, engine as db_engine
from .engine import ItineraryEngine
from .geocoding import geocode_address
from .schemas import (
    CreateTripRequest,
    DraftPlan,
    DraftPlanSaveRequest,
    DraftSchedule,
    GeocodeResponse,
    ItineraryResult,
    JoinTripRequest,
    Participant,
    Trip,
    TripCreateResponse,
)
from .repository import SqlRepository

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
DEFAULT_CORS_ORIGIN_REGEX = r"^https://[a-zA-Z0-9-]+\.vercel\.app$"


@asynccontextmanager
async def lifespan(_: FastAPI):
    print(
        "startup_cors_config",
        {
            "allow_origins": CORS_ORIGINS,
            "allow_origin_regex": CORS_ORIGIN_REGEX,
            "render_git_commit": os.getenv("RENDER_GIT_COMMIT"),
        },
    )
    Base.metadata.create_all(bind=db_engine)
    yield


def _load_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS")
    if raw:
        origins = [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
        if origins:
            return origins
    return DEFAULT_CORS_ORIGINS.copy()


def _load_cors_origin_regex() -> str | None:
    raw = (os.getenv("CORS_ALLOW_ORIGIN_REGEX") or "").strip()
    if raw:
        return raw
    # Keep preview/staging Vercel deployments usable even when CORS_ALLOW_ORIGINS is narrowed.
    return DEFAULT_CORS_ORIGIN_REGEX


CORS_ORIGINS = _load_cors_origins()
CORS_ORIGIN_REGEX = _load_cors_origin_regex()

app = FastAPI(title="AI Group Itinerary Planner API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = SqlRepository()
itinerary_engine = ItineraryEngine()


def _require_trip_access(trip_id: str, trip_token: str | None) -> None:
    access_tokens = store.get_trip_access_tokens(trip_id)
    if not access_tokens:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not trip_token:
        raise HTTPException(status_code=401, detail="Missing X-Trip-Token header")

    owner_token, join_code = access_tokens
    if trip_token not in {owner_token, join_code}:
        raise HTTPException(status_code=403, detail="Invalid trip access token")


@app.post("/trip/create", response_model=TripCreateResponse)
def create_trip(payload: CreateTripRequest):
    trip = Trip(id=str(uuid4()), **payload.model_dump())
    owner_token = secrets.token_urlsafe(24)
    join_code = secrets.token_hex(3).upper()
    return store.create_trip(trip, owner_token=owner_token, join_code=join_code)


@app.post("/trip/{trip_id}/join", response_model=Trip)
def join_trip(trip_id: str, payload: JoinTripRequest, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)

    participant = Participant(trip_id=trip_id, **payload.model_dump())
    updated_trip = store.add_participant(trip_id, participant)
    if not updated_trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return updated_trip


@app.get("/trip/{trip_id}", response_model=Trip)
def get_trip(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.post("/trip/{trip_id}/generate_itinerary", response_model=ItineraryResult)
def generate_itinerary(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        itinerary = itinerary_engine.generate(trip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    store.save_itinerary(trip_id, itinerary)
    return itinerary


@app.get("/trip/{trip_id}/itinerary", response_model=ItineraryResult)
def get_itinerary(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    itinerary = store.get_itinerary(trip_id)
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not generated yet")
    return itinerary


@app.get("/trip/{trip_id}/draft_slots", response_model=DraftSchedule)
def get_draft_slots(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        configured = int(os.getenv("DRAFT_SLOT_CHOICES", "4"))
    except ValueError:
        configured = 4

    try:
        return itinerary_engine.generate_slot_draft(trip, choices_per_slot=configured)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/trip/{trip_id}/draft_plan", response_model=DraftPlan)
def save_draft_plan(
    trip_id: str,
    payload: DraftPlanSaveRequest,
    trip_token: str | None = Header(default=None, alias="X-Trip-Token"),
):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    slot_ids = [selection.slot_id for selection in payload.selections]
    if len(slot_ids) != len(set(slot_ids)):
        raise HTTPException(status_code=422, detail="Duplicate slot selections are not allowed")

    draft_plan = DraftPlan(
        trip_id=trip_id,
        saved_at=datetime.utcnow().isoformat(),
        selections=payload.selections,
    )
    return store.save_draft_plan(trip_id, draft_plan)


@app.get("/trip/{trip_id}/draft_plan", response_model=DraftPlan)
def get_saved_draft_plan(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    draft_plan = store.get_draft_plan(trip_id)
    if not draft_plan:
        raise HTTPException(status_code=404, detail="Draft plan not saved yet")
    return draft_plan


@app.get("/geocode", response_model=GeocodeResponse)
def geocode(q: str):
    query = q.strip()
    if len(query) < 3:
        raise HTTPException(status_code=422, detail="Address query must be at least 3 characters")

    google_api_key = os.getenv("GOOGLE_GEOCODING_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY")
    try:
        max_results = max(1, min(int(os.getenv("GEOCODE_MAX_RESULTS", "6")), 10))
    except ValueError:
        max_results = 6
    results = geocode_address(query=query, google_api_key=google_api_key, limit=max_results)
    return GeocodeResponse(query=query, results=results)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "render_git_commit": os.getenv("RENDER_GIT_COMMIT"),
        "cors_allow_origins": CORS_ORIGINS,
        "cors_allow_origin_regex": CORS_ORIGIN_REGEX,
    }
