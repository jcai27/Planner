from __future__ import annotations

from sqlalchemy import Column, Date, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from .db import Base


class TripModel(Base):
    __tablename__ = "trips"

    id = Column(String, primary_key=True, index=True)
    destination = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    accommodation_lat = Column(Float, nullable=False)
    accommodation_lng = Column(Float, nullable=False)
    owner_token = Column(String, nullable=False, index=True)
    join_code = Column(String, nullable=False)

    participants = relationship("ParticipantModel", back_populates="trip", cascade="all, delete-orphan")
    itinerary = relationship("ItineraryModel", back_populates="trip", uselist=False, cascade="all, delete-orphan")


class ParticipantModel(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    interest_vector = Column(JSON, nullable=False)
    schedule_preference = Column(String, nullable=False)
    wake_preference = Column(String, nullable=False)

    trip = relationship("TripModel", back_populates="participants")


class ItineraryModel(Base):
    __tablename__ = "itineraries"

    trip_id = Column(String, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True)
    generated_at = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)

    trip = relationship("TripModel", back_populates="itinerary")
