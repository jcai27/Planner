from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
import secrets
from typing import Generator, Optional

from sqlalchemy import select

from .db import SessionLocal
from .models import DraftPlanModel, ItineraryModel, ParticipantModel, TripModel, TripPlanningSettingsModel
from .schemas import AnalyticsSummary, DraftPlan, ItineraryResult, Participant, PlanningSettings, Trip, TripCreateResponse


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

    def save_planning_settings(self, trip_id: str, settings: PlanningSettings) -> PlanningSettings:
        with self.session() as db:
            model = db.get(TripPlanningSettingsModel, trip_id)
            payload = settings.model_dump()
            now = datetime.utcnow().isoformat()
            if model:
                model.updated_at = now
                model.payload = payload
            else:
                db.add(
                    TripPlanningSettingsModel(
                        trip_id=trip_id,
                        updated_at=now,
                        payload=payload,
                    )
                )
        return settings

    def get_planning_settings(self, trip_id: str) -> Optional[PlanningSettings]:
        with self.session() as db:
            model = db.execute(
                select(TripPlanningSettingsModel).where(TripPlanningSettingsModel.trip_id == trip_id)
            ).scalar_one_or_none()
            if not model:
                return None
            return PlanningSettings.model_validate(model.payload)

    def touch_share_token(self, trip_id: str) -> Optional[str]:
        with self.session() as db:
            model = db.execute(select(DraftPlanModel).where(DraftPlanModel.trip_id == trip_id)).scalar_one_or_none()
            if not model:
                return None
            payload = dict(model.payload or {})
            metadata = dict(payload.get("metadata") or {})
            token = str(metadata.get("shared_token") or "").strip()
            if not token:
                token = secrets.token_urlsafe(9).replace("-", "").replace("_", "")
            metadata["shared_token"] = token
            metadata["shared_count"] = int(metadata.get("shared_count") or 0) + 1
            metadata["shared_at"] = datetime.utcnow().isoformat()
            payload["metadata"] = metadata
            model.payload = payload
            model.saved_at = payload.get("saved_at") or model.saved_at
            return token

    def get_shared_draft_plan(self, share_token: str) -> Optional[tuple[Trip, DraftPlan]]:
        token = share_token.strip()
        if not token:
            return None
        with self.session() as db:
            draft_models = db.execute(select(DraftPlanModel)).scalars().all()
            for model in draft_models:
                payload = model.payload or {}
                metadata = payload.get("metadata") or {}
                if str(metadata.get("shared_token") or "") != token:
                    continue
                trip_model = db.get(TripModel, model.trip_id)
                if not trip_model:
                    continue
                participants = [
                    Participant(
                        trip_id=p.trip_id,
                        name=p.name,
                        interest_vector=p.interest_vector,
                        schedule_preference=p.schedule_preference,
                        wake_preference=p.wake_preference,
                    )
                    for p in trip_model.participants
                ]
                trip = Trip(
                    id=trip_model.id,
                    destination=trip_model.destination,
                    start_date=trip_model.start_date,
                    end_date=trip_model.end_date,
                    accommodation_address=getattr(trip_model, "accommodation_address", "") or "",
                    accommodation_lat=trip_model.accommodation_lat,
                    accommodation_lng=trip_model.accommodation_lng,
                    participants=participants,
                )
                return trip, DraftPlan.model_validate(payload)
        return None

    def analytics_summary(self) -> AnalyticsSummary:
        with self.session() as db:
            trips = db.execute(select(TripModel)).scalars().all()
            trip_map = {trip.id: trip for trip in trips}
            total_trips = len(trips)

            draft_models = db.execute(select(DraftPlanModel)).scalars().all()
            saved_drafts = len(draft_models)
            trips_with_saved_draft = len({model.trip_id for model in draft_models})

            saved_drafts_full_slots = 0
            saved_drafts_shared = 0
            for model in draft_models:
                payload = model.payload or {}
                selections = payload.get("selections") or []
                metadata = payload.get("metadata") or {}

                trip = trip_map.get(model.trip_id)
                if trip:
                    day_count = (trip.end_date - trip.start_date).days + 1
                    expected_slots = max(1, day_count * 3)
                    if len(selections) >= expected_slots:
                        saved_drafts_full_slots += 1

                if int(metadata.get("shared_count") or 0) > 0:
                    saved_drafts_shared += 1

            def pct(numerator: int, denominator: int) -> float:
                if denominator <= 0:
                    return 0.0
                return round((numerator / denominator) * 100.0, 2)

            return AnalyticsSummary(
                total_trips=total_trips,
                trips_with_saved_draft=trips_with_saved_draft,
                pct_trips_with_saved_draft=pct(trips_with_saved_draft, total_trips),
                saved_drafts=saved_drafts,
                saved_drafts_full_slots=saved_drafts_full_slots,
                pct_saved_drafts_full_slots=pct(saved_drafts_full_slots, saved_drafts),
                saved_drafts_shared=saved_drafts_shared,
                pct_saved_drafts_shared=pct(saved_drafts_shared, saved_drafts),
            )
