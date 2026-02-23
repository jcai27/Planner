from __future__ import annotations

import os
from collections import Counter
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient


DB_PATH = Path(__file__).resolve().parent / "test_planner.db"
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"

from app.db import Base, engine
from app.engine import ItineraryEngine
from app.main import app
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
