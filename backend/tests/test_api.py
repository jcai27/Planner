from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient


DB_PATH = Path(__file__).resolve().parent / "test_planner.db"
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"

from app.db import Base, engine
from app.main import app


def setup_module():
    if DB_PATH.exists():
        DB_PATH.unlink()
    Base.metadata.create_all(bind=engine)


def teardown_module():
    Base.metadata.drop_all(bind=engine)
    if DB_PATH.exists():
        DB_PATH.unlink()


def test_trip_lifecycle_flow():
    client = TestClient(app)

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
    join_resp = client.post(f"/trip/{trip_id}/join", json=join_payload)
    assert join_resp.status_code == 200
    joined_trip = join_resp.json()
    assert len(joined_trip["participants"]) == 1

    generate_resp = client.post(f"/trip/{trip_id}/generate_itinerary")
    assert generate_resp.status_code == 200
    itinerary = generate_resp.json()
    assert itinerary["trip_id"] == trip_id
    assert len(itinerary["options"]) == 3

    for option in itinerary["options"]:
        assert option["name"] in {"Packed Experience", "Balanced Exploration", "Relaxed Trip"}
        assert isinstance(option["days"], list)

    fetch_itinerary = client.get(f"/trip/{trip_id}/itinerary")
    assert fetch_itinerary.status_code == 200
    assert fetch_itinerary.json()["trip_id"] == trip_id


def test_generate_requires_participant():
    client = TestClient(app)

    create_payload = {
        "destination": "Tokyo",
        "start_date": "2026-06-01",
        "end_date": "2026-06-03",
        "accommodation_lat": 35.6762,
        "accommodation_lng": 139.6503,
    }
    create_resp = client.post("/trip/create", json=create_payload)
    assert create_resp.status_code == 200
    trip_id = create_resp.json()["id"]

    generate_resp = client.post(f"/trip/{trip_id}/generate_itinerary")
    assert generate_resp.status_code == 400
    assert "At least one participant" in generate_resp.json()["detail"]
