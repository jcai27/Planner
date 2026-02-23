import { ItineraryResult, Trip } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    cache: "no-store"
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  createTrip(payload: {
    destination: string;
    start_date: string;
    end_date: string;
    accommodation_lat: number;
    accommodation_lng: number;
  }) {
    return req<Trip>("/trip/create", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  joinTrip(tripId: string, payload: {
    name: string;
    interest_vector: {
      food: number;
      nightlife: number;
      culture: number;
      outdoors: number;
      relaxation: number;
    };
    schedule_preference: "packed" | "balanced" | "chill";
    wake_preference: "early" | "normal" | "late";
  }) {
    return req<Trip>(`/trip/${tripId}/join`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getTrip(tripId: string) {
    return req<Trip>(`/trip/${tripId}`);
  },

  generateItinerary(tripId: string) {
    return req<ItineraryResult>(`/trip/${tripId}/generate_itinerary`, { method: "POST" });
  },

  getItinerary(tripId: string) {
    return req<ItineraryResult>(`/trip/${tripId}/itinerary`);
  }
};
