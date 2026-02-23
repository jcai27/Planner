from __future__ import annotations

from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import select

from .db import SessionLocal
from .models import DraftPlanModel, ItineraryModel, ParticipantModel, TripModel
from .schemas import DraftPlan, ItineraryResult, Participant, Trip, TripCreateResponse


class SqlRepository:
    @contextmanager
    def session(self) -> Generator:
        db = SessionLocal()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def create_trip(self, trip: Trip, owner_token: str, join_code: str) -> TripCreateResponse:
        with self.session() as db:
            model = TripModel(
                id=trip.id,
                destination=trip.destination,
                start_date=trip.start_date,
                end_date=trip.end_date,
                accommodation_lat=trip.accommodation_lat,
                accommodation_lng=trip.accommodation_lng,
                owner_token=owner_token,
                join_code=join_code,
            )
            db.add(model)
        return TripCreateResponse(**trip.model_dump(), owner_token=owner_token, join_code=join_code)

    def get_trip(self, trip_id: str) -> Optional[Trip]:
        with self.session() as db:
            model = db.get(TripModel, trip_id)
            if not model:
                return None
            participants = [
                Participant(
                    trip_id=p.trip_id,
                    name=p.name,
                    interest_vector=p.interest_vector,
                    schedule_preference=p.schedule_preference,
                    wake_preference=p.wake_preference,
                )
                for p in model.participants
            ]
            return Trip(
                id=model.id,
                destination=model.destination,
                start_date=model.start_date,
                end_date=model.end_date,
                accommodation_address=getattr(model, "accommodation_address", "") or "",
                accommodation_lat=model.accommodation_lat,
                accommodation_lng=model.accommodation_lng,
                participants=participants,
            )

    def add_participant(self, trip_id: str, participant: Participant) -> Optional[Trip]:
        with self.session() as db:
            model = db.get(TripModel, trip_id)
            if not model:
                return None

            db.add(
                ParticipantModel(
                    trip_id=trip_id,
                    name=participant.name,
                    interest_vector=participant.interest_vector.model_dump(),
                    schedule_preference=participant.schedule_preference.value,
                    wake_preference=participant.wake_preference.value,
                )
            )

        return self.get_trip(trip_id)

    def get_trip_access_tokens(self, trip_id: str) -> Optional[tuple[str, str]]:
        with self.session() as db:
            model = db.get(TripModel, trip_id)
            if not model:
                return None
            return model.owner_token, model.join_code

    def save_itinerary(self, trip_id: str, itinerary: ItineraryResult) -> None:
        with self.session() as db:
            model = db.get(ItineraryModel, trip_id)
            payload = itinerary.model_dump()
            if model:
                model.generated_at = itinerary.generated_at
                model.payload = payload
            else:
                db.add(
                    ItineraryModel(
                        trip_id=trip_id,
                        generated_at=itinerary.generated_at,
                        payload=payload,
                    )
                )

    def get_itinerary(self, trip_id: str) -> Optional[ItineraryResult]:
        with self.session() as db:
            model = db.execute(select(ItineraryModel).where(ItineraryModel.trip_id == trip_id)).scalar_one_or_none()
            if not model:
                return None
            return ItineraryResult.model_validate(model.payload)

    def save_draft_plan(self, trip_id: str, draft_plan: DraftPlan) -> DraftPlan:
        with self.session() as db:
            model = db.get(DraftPlanModel, trip_id)
            payload = draft_plan.model_dump()
            if model:
                model.saved_at = draft_plan.saved_at
                model.payload = payload
            else:
                db.add(
                    DraftPlanModel(
                        trip_id=trip_id,
                        saved_at=draft_plan.saved_at,
                        payload=payload,
                    )
                )
        return draft_plan

    def get_draft_plan(self, trip_id: str) -> Optional[DraftPlan]:
        with self.session() as db:
            model = db.execute(select(DraftPlanModel).where(DraftPlanModel.trip_id == trip_id)).scalar_one_or_none()
            if not model:
                return None
            return DraftPlan.model_validate(model.payload)
