from __future__ import annotations

from collections import defaultdict
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
    AnalyticsSummary,
    CreateTripRequest,
    DraftPlan,
    DraftPlanMetadata,
    DraftPlanSaveRequest,
    DraftSchedule,
    DraftValidationDay,
    DraftValidationReport,
    GeocodeResponse,
    ItineraryResult,
    JoinTripRequest,
    Participant,
    PlanningSettings,
    ShareDraftPlanResponse,
    SharedDraftPlanResponse,
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


def _normalized_tokens(values: list[str]) -> set[str]:
    return {value.strip().lower() for value in values if value and value.strip()}


def _matches_tokens(name: str, tokens: set[str]) -> bool:
    normalized = (name or "").strip().lower()
    return any(token in normalized for token in tokens)


def _price_level_value(price_level: int) -> float:
    mapping = {
        0: 0.0,
        1: 12.0,
        2: 35.0,
        3: 75.0,
        4: 130.0,
    }
    return mapping.get(max(0, min(price_level, 4)), 35.0)


def _price_label_from_value(value: float) -> str:
    if value <= 0:
        return "Free"
    if value <= 20:
        return "Under $20"
    if value <= 50:
        return "$20 - $50"
    if value <= 100:
        return "$50 - $100"
    return "$100+"


def _build_day_route_url(trip: Trip, day_activities: list) -> str | None:
    points = [(activity.latitude, activity.longitude) for activity in day_activities if activity]
    if not points:
        return None
    origin = f"{trip.accommodation_lat},{trip.accommodation_lng}"
    destination = f"{points[-1][0]},{points[-1][1]}"
    if len(points) > 1:
        waypoints = "|".join(f"{lat},{lng}" for lat, lng in points[:-1])
        return (
            f"https://www.google.com/maps/dir/?api=1&origin={origin}&destination={destination}"
            f"&waypoints={waypoints}&travelmode=driving"
        )
    return f"https://www.google.com/maps/dir/?api=1&origin={origin}&destination={destination}&travelmode=driving"


def _build_draft_validation(trip: Trip, draft_plan: DraftPlan, settings: PlanningSettings) -> DraftValidationReport:
    day_count = (trip.end_date - trip.start_date).days + 1
    selections_by_day: dict[int, dict[str, object]] = defaultdict(dict)
    for selection in draft_plan.selections:
        selections_by_day[selection.day][selection.slot.value] = selection.activity

    days: list[DraftValidationDay] = []
    overall_warnings: list[str] = []
    total_cost = 0.0
    must_do_tokens = _normalized_tokens(settings.must_do_places)
    avoid_tokens = _normalized_tokens(settings.avoid_places)
    matched_must_do: set[str] = set()
    matched_avoid: set[str] = set()

    for day in range(1, day_count + 1):
        slots = selections_by_day.get(day, {})
        ordered = [slots.get("morning"), slots.get("afternoon"), slots.get("evening")]
        day_cost = sum(_price_level_value(activity.price_level) for activity in ordered if activity)
        total_cost += day_cost

        transfer_total = 0
        max_leg = 0
        previous = None
        warnings: list[str] = []
        for activity in ordered:
            if not activity:
                continue
            name = activity.name
            if must_do_tokens and _matches_tokens(name, must_do_tokens):
                for token in must_do_tokens:
                    if token in name.lower():
                        matched_must_do.add(token)
            if avoid_tokens and _matches_tokens(name, avoid_tokens):
                for token in avoid_tokens:
                    if token in name.lower():
                        matched_avoid.add(token)
                warnings.append(f"Includes avoided place hint: {name}")
            if activity.rating < 4.0:
                warnings.append(f"Low-rated stop: {name} ({activity.rating:.1f})")

            if previous is not None:
                km = itinerary_engine._haversine_km(previous.latitude, previous.longitude, activity.latitude, activity.longitude)
                leg_minutes = int(round((km / 25.0) * 60))
                transfer_total += leg_minutes
                max_leg = max(max_leg, leg_minutes)
            previous = activity

        if day_cost > settings.daily_budget_per_person:
            warnings.append(f"Over daily budget by ${day_cost - settings.daily_budget_per_person:.0f}")
        if max_leg > settings.max_transfer_minutes:
            warnings.append(f"Longest transfer is {max_leg} min (limit {settings.max_transfer_minutes} min)")
        if len([activity for activity in ordered if activity]) < 3:
            warnings.append("Day has open slots.")

        route_url = _build_day_route_url(trip, [activity for activity in ordered if activity])
        days.append(
            DraftValidationDay(
                day=day,
                estimated_cost_per_person=_price_label_from_value(day_cost),
                estimated_cost_value=round(day_cost, 2),
                transfer_minutes_total=transfer_total,
                max_leg_minutes=max_leg,
                warnings=warnings,
                route_map_url=route_url,
            )
        )
        if warnings:
            overall_warnings.extend([f"Day {day}: {warning}" for warning in warnings])

    if must_do_tokens:
        missing = must_do_tokens - matched_must_do
        if missing:
            overall_warnings.append(f"Must-do places not included yet: {', '.join(sorted(missing))}")
    if matched_avoid:
        overall_warnings.append(f"Selections include avoided place hints: {', '.join(sorted(matched_avoid))}")

    return DraftValidationReport(
        trip_id=trip.id,
        generated_at=datetime.utcnow().isoformat(),
        day_count=day_count,
        total_estimated_cost_per_person=round(total_cost, 2),
        days=days,
        warnings=overall_warnings,
    )


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
        settings = store.get_planning_settings(trip_id) or PlanningSettings()
        return itinerary_engine.generate_slot_draft(trip, choices_per_slot=configured, planning_settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/trip/{trip_id}/planning_settings", response_model=PlanningSettings)
def get_trip_planning_settings(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    return store.get_planning_settings(trip_id) or PlanningSettings()


@app.put("/trip/{trip_id}/planning_settings", response_model=PlanningSettings)
def upsert_trip_planning_settings(
    trip_id: str,
    payload: PlanningSettings,
    trip_token: str | None = Header(default=None, alias="X-Trip-Token"),
):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return store.save_planning_settings(trip_id, payload)


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

    existing = store.get_draft_plan(trip_id)
    planning_settings = payload.planning_settings or store.get_planning_settings(trip_id) or PlanningSettings()
    if payload.planning_settings:
        store.save_planning_settings(trip_id, payload.planning_settings)
    day_count = (trip.end_date - trip.start_date).days + 1
    expected_slots = max(1, day_count * 3)
    coverage_ratio = min(1.0, len(payload.selections) / expected_slots)

    draft_plan = DraftPlan(
        trip_id=trip_id,
        saved_at=datetime.utcnow().isoformat(),
        selections=payload.selections,
        metadata=DraftPlanMetadata(
            planning_settings=planning_settings,
            slot_feedback=payload.slot_feedback,
            selection_coverage_ratio=coverage_ratio,
            shared_token=existing.metadata.shared_token if existing else None,
            shared_count=existing.metadata.shared_count if existing else 0,
            shared_at=existing.metadata.shared_at if existing else None,
        ),
    )
    return store.save_draft_plan(trip_id, draft_plan)


@app.get("/trip/{trip_id}/draft_plan", response_model=DraftPlan)
def get_saved_draft_plan(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    draft_plan = store.get_draft_plan(trip_id)
    if not draft_plan:
        raise HTTPException(status_code=404, detail="Draft plan not saved yet")
    return draft_plan


@app.get("/trip/{trip_id}/draft_validation", response_model=DraftValidationReport)
def get_draft_validation_report(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    draft_plan = store.get_draft_plan(trip_id)
    if not draft_plan:
        raise HTTPException(status_code=404, detail="Draft plan not saved yet")
    planning_settings = draft_plan.metadata.planning_settings or store.get_planning_settings(trip_id) or PlanningSettings()
    return _build_draft_validation(trip, draft_plan, planning_settings)


@app.post("/trip/{trip_id}/share", response_model=ShareDraftPlanResponse)
def create_trip_share_link(trip_id: str, trip_token: str | None = Header(default=None, alias="X-Trip-Token")):
    _require_trip_access(trip_id, trip_token)
    draft_plan = store.get_draft_plan(trip_id)
    if not draft_plan:
        raise HTTPException(status_code=400, detail="Save a draft plan before creating a share link")
    token = store.touch_share_token(trip_id)
    if not token:
        raise HTTPException(status_code=500, detail="Could not create share link")
    base = (os.getenv("FRONTEND_BASE_URL") or "http://localhost:3000").strip().rstrip("/")
    return ShareDraftPlanResponse(share_token=token, share_url=f"{base}/share/{token}")


@app.get("/share/{share_token}", response_model=SharedDraftPlanResponse)
def get_shared_draft_plan(share_token: str):
    shared = store.get_shared_draft_plan(share_token)
    if not shared:
        raise HTTPException(status_code=404, detail="Shared itinerary not found")
    trip, draft_plan = shared
    planning_settings = draft_plan.metadata.planning_settings if draft_plan.metadata else PlanningSettings()
    validation = _build_draft_validation(trip, draft_plan, planning_settings)
    return SharedDraftPlanResponse(
        trip_id=trip.id,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        accommodation_address=trip.accommodation_address,
        draft_plan=draft_plan,
        validation=validation,
    )


@app.get("/analytics/summary", response_model=AnalyticsSummary)
def get_analytics_summary():
    return store.analytics_summary()


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
