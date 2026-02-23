from __future__ import annotations

import os
from collections import Counter
from datetime import date
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient


DB_PATH = Path(__file__).resolve().parent / "test_planner.db"
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"

from app.db import Base, engine
from app.engine import ItineraryEngine
from app.main import DEFAULT_CORS_ORIGIN_REGEX, app, _load_cors_origin_regex, _load_cors_origins
from app.schemas import Activity, Trip


def auth_headers(token: str) -> dict[str, str]:
    return {"X-Trip-Token": token}


def setup_module():
    engine.dispose()
    if DB_PATH.exists():
        DB_PATH.unlink()
    Base.metadata.create_all(bind=engine)


def teardown_module():
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if DB_PATH.exists():
        DB_PATH.unlink()


def test_trip_lifecycle_flow():
    with TestClient(app) as client:
        create_payload = {
            "destination": "Paris",
            "start_date": "2026-05-10",
            "end_date": "2026-05-12",
            "accommodation_lat": 48.8566,
            "accommodation_lng": 2.3522,
        }
        create_resp = client.post("/trip/create", json=create_payload)
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        owner_token = trip["owner_token"]
        join_code = trip["join_code"]

        join_payload = {
            "name": "Ava",
            "interest_vector": {
                "food": 5,
                "nightlife": 2,
                "culture": 4,
                "outdoors": 3,
                "relaxation": 2,
            },
            "schedule_preference": "balanced",
            "wake_preference": "normal",
        }
        join_resp = client.post(f"/trip/{trip_id}/join", json=join_payload, headers=auth_headers(join_code))
        assert join_resp.status_code == 200
        joined_trip = join_resp.json()
        assert len(joined_trip["participants"]) == 1

        generate_resp = client.post(f"/trip/{trip_id}/generate_itinerary", headers=auth_headers(owner_token))
        assert generate_resp.status_code == 200
        itinerary = generate_resp.json()
        assert itinerary["trip_id"] == trip_id
        assert len(itinerary["options"]) == 3

        for option in itinerary["options"]:
            assert option["name"] in {"Packed Experience", "Balanced Exploration", "Relaxed Trip"}
            assert isinstance(option["days"], list)

        fetch_itinerary = client.get(f"/trip/{trip_id}/itinerary", headers=auth_headers(owner_token))
        assert fetch_itinerary.status_code == 200
        assert fetch_itinerary.json()["trip_id"] == trip_id


def test_generate_requires_participant():
    with TestClient(app) as client:
        create_payload = {
            "destination": "Tokyo",
            "start_date": "2026-06-01",
            "end_date": "2026-06-03",
            "accommodation_lat": 35.6762,
            "accommodation_lng": 139.6503,
        }
        create_resp = client.post("/trip/create", json=create_payload)
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        owner_token = trip["owner_token"]

        generate_resp = client.post(f"/trip/{trip_id}/generate_itinerary", headers=auth_headers(owner_token))
        assert generate_resp.status_code == 400
        assert "At least one participant" in generate_resp.json()["detail"]


def test_long_trip_returns_day_count():
    with TestClient(app) as client:
        create_payload = {
            "destination": "Paris",
            "start_date": "2026-05-01",
            "end_date": "2026-05-10",
            "accommodation_lat": 48.8566,
            "accommodation_lng": 2.3522,
        }
        create_resp = client.post("/trip/create", json=create_payload)
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        owner_token = trip["owner_token"]
        join_code = trip["join_code"]

        join_resp = client.post(
            f"/trip/{trip_id}/join",
            json={
                "name": "Ava",
                "interest_vector": {
                    "food": 5,
                    "nightlife": 2,
                    "culture": 4,
                    "outdoors": 3,
                    "relaxation": 2,
                },
                "schedule_preference": "balanced",
                "wake_preference": "normal",
            },
            headers=auth_headers(join_code),
        )
        assert join_resp.status_code == 200

        generate_resp = client.post(f"/trip/{trip_id}/generate_itinerary", headers=auth_headers(owner_token))
        assert generate_resp.status_code == 200
        itinerary = generate_resp.json()
        for option in itinerary["options"]:
            assert len(option["days"]) == 10
            for day in option["days"]:
                names = [
                    day.get("morning_activity", {}).get("name") if day.get("morning_activity") else None,
                    day.get("afternoon_activity", {}).get("name") if day.get("afternoon_activity") else None,
                    day.get("dinner", {}).get("name") if day.get("dinner") else None,
                    day.get("evening_option", {}).get("name") if day.get("evening_option") else None,
                ]
                names = [name for name in names if name]
                assert len(names) == len(set(names))


def test_create_trip_rejects_out_of_range_coordinates():
    with TestClient(app) as client:
        create_resp = client.post(
            "/trip/create",
            json={
                "destination": "Paris",
                "start_date": "2026-05-10",
                "end_date": "2026-05-12",
                "accommodation_lat": 120.0,
                "accommodation_lng": 2.3522,
            },
        )
        assert create_resp.status_code == 422
        assert "accommodation_lat" in create_resp.text


def test_create_trip_rejects_overlong_duration():
    with TestClient(app) as client:
        create_resp = client.post(
            "/trip/create",
            json={
                "destination": "Paris",
                "start_date": "2026-05-01",
                "end_date": "2026-06-15",
                "accommodation_lat": 48.8566,
                "accommodation_lng": 2.3522,
            },
        )
        assert create_resp.status_code == 422
        assert "trip length must be at most" in create_resp.text


def test_trip_endpoints_require_valid_access_token():
    with TestClient(app) as client:
        create_resp = client.post(
            "/trip/create",
            json={
                "destination": "Paris",
                "start_date": "2026-05-10",
                "end_date": "2026-05-12",
                "accommodation_lat": 48.8566,
                "accommodation_lng": 2.3522,
            },
        )
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        join_code = trip["join_code"]

        missing_token_resp = client.get(f"/trip/{trip_id}")
        assert missing_token_resp.status_code == 401

        invalid_token_resp = client.get(f"/trip/{trip_id}", headers=auth_headers("wrong-token"))
        assert invalid_token_resp.status_code == 403

        valid_token_resp = client.get(f"/trip/{trip_id}", headers=auth_headers(join_code))
        assert valid_token_resp.status_code == 200


def test_geocode_endpoint_returns_candidates(monkeypatch):
    from app import main as main_module

    monkeypatch.setattr(
        main_module,
        "geocode_address",
        lambda query, google_api_key, limit: [
            {
                "address": "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA",
                "lat": 37.422,
                "lng": -122.084,
                "provider": "google_geocoding",
                "confidence": 1.0,
            }
        ],
    )

    with TestClient(app) as client:
        resp = client.get("/geocode", params={"q": "1600 Amphitheatre Pkwy, Mountain View, CA"})

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["query"] == "1600 Amphitheatre Pkwy, Mountain View, CA"
    assert payload["results"]
    assert payload["results"][0]["address"].startswith("1600 Amphitheatre")


def test_geocode_endpoint_rejects_short_query():
    with TestClient(app) as client:
        resp = client.get("/geocode", params={"q": "a"})

    assert resp.status_code == 422


def test_draft_slots_returns_three_slots_per_day():
    with TestClient(app) as client:
        create_resp = client.post(
            "/trip/create",
            json={
                "destination": "Paris",
                "start_date": "2026-05-10",
                "end_date": "2026-05-11",
                "accommodation_address": "Eiffel Tower, Paris",
                "accommodation_lat": 48.8584,
                "accommodation_lng": 2.2945,
            },
        )
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        join_code = trip["join_code"]

        join_resp = client.post(
            f"/trip/{trip_id}/join",
            json={
                "name": "Ava",
                "interest_vector": {
                    "food": 5,
                    "nightlife": 2,
                    "culture": 4,
                    "outdoors": 3,
                    "relaxation": 2,
                },
                "schedule_preference": "balanced",
                "wake_preference": "normal",
            },
            headers=auth_headers(join_code),
        )
        assert join_resp.status_code == 200

        draft_resp = client.get(f"/trip/{trip_id}/draft_slots", headers=auth_headers(join_code))
        assert draft_resp.status_code == 200
        payload = draft_resp.json()
        assert payload["trip_id"] == trip_id
        assert len(payload["slots"]) == 6  # 2 days x 3 slots/day
        for slot in payload["slots"]:
            assert slot["slot"] in {"morning", "afternoon", "evening"}
            assert 1 <= len(slot["candidates"]) <= 4


def test_draft_plan_can_be_saved_and_retrieved():
    with TestClient(app) as client:
        create_resp = client.post(
            "/trip/create",
            json={
                "destination": "Paris",
                "start_date": "2026-05-10",
                "end_date": "2026-05-11",
                "accommodation_address": "Eiffel Tower, Paris",
                "accommodation_lat": 48.8584,
                "accommodation_lng": 2.2945,
            },
        )
        assert create_resp.status_code == 200
        trip = create_resp.json()
        trip_id = trip["id"]
        join_code = trip["join_code"]

        join_resp = client.post(
            f"/trip/{trip_id}/join",
            json={
                "name": "Ava",
                "interest_vector": {
                    "food": 5,
                    "nightlife": 2,
                    "culture": 4,
                    "outdoors": 3,
                    "relaxation": 2,
                },
                "schedule_preference": "balanced",
                "wake_preference": "normal",
            },
            headers=auth_headers(join_code),
        )
        assert join_resp.status_code == 200

        draft_resp = client.get(f"/trip/{trip_id}/draft_slots", headers=auth_headers(join_code))
        assert draft_resp.status_code == 200
        slots = draft_resp.json()["slots"]
        assert slots

        selections = [
            {
                "slot_id": slot["slot_id"],
                "day": slot["day"],
                "slot": slot["slot"],
                "activity": slot["candidates"][0],
            }
            for slot in slots
            if slot["candidates"]
        ]

        save_resp = client.post(
            f"/trip/{trip_id}/draft_plan",
            json={"selections": selections},
            headers=auth_headers(join_code),
        )
        assert save_resp.status_code == 200
        saved_payload = save_resp.json()
        assert saved_payload["trip_id"] == trip_id
        assert len(saved_payload["selections"]) == len(selections)

        fetch_resp = client.get(f"/trip/{trip_id}/draft_plan", headers=auth_headers(join_code))
        assert fetch_resp.status_code == 200
        fetched_payload = fetch_resp.json()
        assert fetched_payload["trip_id"] == trip_id
        assert len(fetched_payload["selections"]) == len(selections)
        assert fetched_payload["selections"][0]["slot_id"] == selections[0]["slot_id"]


def test_cors_defaults_include_local_dev_and_vercel_preview_regex(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ALLOW_ORIGIN_REGEX", raising=False)

    origins = _load_cors_origins()
    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:3000" in origins
    assert _load_cors_origin_regex() == DEFAULT_CORS_ORIGIN_REGEX


def test_cors_preflight_allows_vercel_origin_with_token_header(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:3000")
    monkeypatch.delenv("CORS_ALLOW_ORIGIN_REGEX", raising=False)

    cors_app = FastAPI()
    cors_app.add_middleware(
        CORSMiddleware,
        allow_origins=_load_cors_origins(),
        allow_origin_regex=_load_cors_origin_regex(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @cors_app.get("/trip/{trip_id}")
    def get_trip_stub(trip_id: str):
        return {"trip_id": trip_id}

    with TestClient(cors_app) as client:
        preflight = client.options(
            "/trip/6e185475-09ef-4454-aaf1-9bec49306ad8",
            headers={
                "Origin": "https://planner-sepia-alpha.vercel.app",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-trip-token,content-type",
            },
        )

    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "https://planner-sepia-alpha.vercel.app"
    assert preflight.headers.get("access-control-allow-credentials") == "true"


def test_style_scoring_changes_activity_priority():
    itinerary_engine = ItineraryEngine()
    activities = [
        Activity(
            name="Grand Museum",
            category="museum",
            rating=4.9,
            price_level=3,
            latitude=48.8660,
            longitude=2.3550,
            typical_visit_duration=240,
        ),
        Activity(
            name="Urban Spa",
            category="spa",
            rating=4.6,
            price_level=3,
            latitude=48.8655,
            longitude=2.3548,
            typical_visit_duration=60,
        ),
    ]
    trip = Trip(
        id="style-test",
        destination="Paris",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 1),
        accommodation_lat=48.8566,
        accommodation_lng=2.3522,
        participants=[],
    )
    group_interest_vector = {"food": 2.0, "nightlife": 2.0, "culture": 4.0, "outdoors": 2.0, "relaxation": 4.0}
    wake_profile = Counter(["normal"])

    packed = itinerary_engine._score_activities(
        activities=activities,
        group_interest_vector=group_interest_vector,
        trip=trip,
        wake_profile=wake_profile,
        style="packed",
    )
    chill = itinerary_engine._score_activities(
        activities=activities,
        group_interest_vector=group_interest_vector,
        trip=trip,
        wake_profile=wake_profile,
        style="chill",
    )

    assert packed[0][0].name == "Grand Museum"
    assert chill[0][0].name == "Urban Spa"


def test_fetch_activities_uses_google_places_when_available():
    class FakeGooglePlacesClient:
        def fetch_activities(self, destination: str, lat: float, lng: float):
            return [("Google Museum", "museum", 4.9, 3, lat + 0.001, lng + 0.001, 150)]

    itinerary_engine = ItineraryEngine()
    itinerary_engine.google_places_client = FakeGooglePlacesClient()

    activities = itinerary_engine._fetch_activities("Paris", 48.8566, 2.3522)
    assert activities
    assert activities[0].name == "Google Museum"
    assert activities[0].category == "museum"


def test_fetch_activities_falls_back_if_google_places_errors():
    class BrokenGooglePlacesClient:
        def fetch_activities(self, destination: str, lat: float, lng: float):
            raise RuntimeError("simulated places outage")

    itinerary_engine = ItineraryEngine()
    itinerary_engine.google_places_client = BrokenGooglePlacesClient()

    activities = itinerary_engine._fetch_activities("Unknown City", 48.8566, 2.3522)
    assert activities
    names = {activity.name for activity in activities}
    assert "Neighborhood Food Hall" in names
