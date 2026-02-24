import {
  AnalyticsSummary,
  DraftPlan,
  DraftSlotFeedback,
  DraftSelection,
  DraftSchedule,
  DraftValidationReport,
  ItineraryResult,
  PlanningSettings,
  ShareDraftPlanResponse,
  SharedDraftPlanResponse,
  Trip,
  TripCreateResponse
} from "@/lib/types";

const API_BASE = "/api/backend";
const TOKEN_STORAGE_PREFIX = "trip-token:";
const JOIN_CODE_STORAGE_PREFIX = "trip-join-code:";

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

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function tokenStorageKey(tripId: string): string {
  return `${TOKEN_STORAGE_PREFIX}${tripId}`;
}

function joinCodeStorageKey(tripId: string): string {
  return `${JOIN_CODE_STORAGE_PREFIX}${tripId}`;
}

function getStoredTripToken(tripId: string): string | null {
  if (!canUseStorage()) {
    return null;
  }
  return window.localStorage.getItem(tokenStorageKey(tripId));
}

function tripReq<T>(tripId: string, path: string, options?: RequestInit): Promise<T> {
  const tripToken = getStoredTripToken(tripId);
  if (!tripToken) {
    throw new Error("Missing trip access token. Open this trip using a valid invite link.");
  }
  return req<T>(path, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      "X-Trip-Token": tripToken
    }
  });
}

export const api = {
  saveTripAccess(tripId: string, tripToken: string, joinCode?: string) {
    if (!canUseStorage()) {
      return;
    }
    window.localStorage.setItem(tokenStorageKey(tripId), tripToken);
    if (joinCode) {
      window.localStorage.setItem(joinCodeStorageKey(tripId), joinCode);
    }
  },

  getSavedJoinCode(tripId: string): string | null {
    if (!canUseStorage()) {
      return null;
    }
    return window.localStorage.getItem(joinCodeStorageKey(tripId));
  },

  createTrip(payload: {
    destination: string;
    start_date: string;
    end_date: string;
    accommodation_address: string;
    accommodation_lat: number;
    accommodation_lng: number;
  }) {
    return req<TripCreateResponse>("/trip/create", {
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
    return tripReq<Trip>(tripId, `/trip/${tripId}/join`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getTrip(tripId: string) {
    return tripReq<Trip>(tripId, `/trip/${tripId}`);
  },

  generateItinerary(tripId: string) {
    return tripReq<ItineraryResult>(tripId, `/trip/${tripId}/generate_itinerary`, { method: "POST" });
  },

  getItinerary(tripId: string) {
    return tripReq<ItineraryResult>(tripId, `/trip/${tripId}/itinerary`);
  },

  getDraftSlots(tripId: string) {
    return tripReq<DraftSchedule>(tripId, `/trip/${tripId}/draft_slots`);
  },

  getPlanningSettings(tripId: string) {
    return tripReq<PlanningSettings>(tripId, `/trip/${tripId}/planning_settings`);
  },

  savePlanningSettings(tripId: string, payload: PlanningSettings) {
    return tripReq<PlanningSettings>(tripId, `/trip/${tripId}/planning_settings`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  saveDraftPlan(tripId: string, payload: { selections: DraftSelection[]; planning_settings?: PlanningSettings; slot_feedback?: DraftSlotFeedback[] }) {
    return tripReq<DraftPlan>(tripId, `/trip/${tripId}/draft_plan`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getDraftPlan(tripId: string) {
    return tripReq<DraftPlan>(tripId, `/trip/${tripId}/draft_plan`);
  },

  getDraftValidation(tripId: string) {
    return tripReq<DraftValidationReport>(tripId, `/trip/${tripId}/draft_validation`);
  },

  createShareLink(tripId: string) {
    return tripReq<ShareDraftPlanResponse>(tripId, `/trip/${tripId}/share`, { method: "POST" });
  },

  getSharedDraft(shareToken: string) {
    return req<SharedDraftPlanResponse>(`/share/${encodeURIComponent(shareToken)}`);
  },

  getAnalyticsSummary() {
    return req<AnalyticsSummary>("/analytics/summary");
  },
};
