from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from . import models  # noqa: F401
from .db import Base, engine as db_engine
from .engine import ItineraryEngine
from .schemas import CreateTripRequest, JoinTripRequest, Participant, Trip
from .repository import SqlRepository

app = FastAPI(title="AI Group Itinerary Planner API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = SqlRepository()
itinerary_engine = ItineraryEngine()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=db_engine)


@app.post("/trip/create", response_model=Trip)
def create_trip(payload: CreateTripRequest):
    trip = Trip(id=str(uuid4()), **payload.model_dump())
    return store.create_trip(trip)


@app.post("/trip/{trip_id}/join", response_model=Trip)
def join_trip(trip_id: str, payload: JoinTripRequest):
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    participant = Participant(trip_id=trip_id, **payload.model_dump())
    updated_trip = store.add_participant(trip_id, participant)
    if not updated_trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return updated_trip


@app.get("/trip/{trip_id}", response_model=Trip)
def get_trip(trip_id: str):
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.post("/trip/{trip_id}/generate_itinerary")
def generate_itinerary(trip_id: str):
    trip = store.get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        itinerary = itinerary_engine.generate(trip)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    store.save_itinerary(trip_id, itinerary)
    return itinerary


@app.get("/trip/{trip_id}/itinerary")
def get_itinerary(trip_id: str):
    itinerary = store.get_itinerary(trip_id)
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not generated yet")
    return itinerary
