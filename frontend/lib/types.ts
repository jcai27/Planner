export type SchedulePreference = "packed" | "balanced" | "chill";
export type WakePreference = "early" | "normal" | "late";

export type InterestVector = {
  food: number;
  nightlife: number;
  culture: number;
  outdoors: number;
  relaxation: number;
};

export type Participant = {
  trip_id: string;
  name: string;
  interest_vector: InterestVector;
  schedule_preference: SchedulePreference;
  wake_preference: WakePreference;
};

export type Trip = {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  accommodation_address: string;
  accommodation_lat: number;
  accommodation_lng: number;
  participants: Participant[];
};

export type TripCreateResponse = Trip & {
  owner_token: string;
  join_code: string;
};

export type Activity = {
  name: string;
  category: string;
  rating: number;
  price_level: number;
  latitude: number;
  longitude: number;
  typical_visit_duration: number;
  explanation?: string;
  image_url?: string;
  activity_url?: string;
  estimated_price?: string;
  price_confidence?: "verified" | "inferred" | "unknown" | string;
  group_fit_score?: number;
  conflict_summary?: string;
};

export type DayPlan = {
  day: number;
  morning_activity?: Activity;
  afternoon_activity?: Activity;
  dinner?: Activity;
  evening_option?: Activity;
};

export type ItineraryOption = {
  name: string;
  style: string;
  group_match_score: number;
  explanation: string;
  days: DayPlan[];
};

export type ItineraryResult = {
  trip_id: string;
  generated_at: string;
  options: ItineraryOption[];
};

export type DraftSlotName = "morning" | "afternoon" | "evening";

export type DraftSlot = {
  slot_id: string;
  day: number;
  slot: DraftSlotName;
  candidates: Activity[];
};

export type DraftSchedule = {
  trip_id: string;
  generated_at: string;
  slots: DraftSlot[];
};

export type DraftSelection = {
  slot_id: string;
  day: number;
  slot: DraftSlotName;
  activity: Activity;
};

export type PlanningSettings = {
  daily_budget_per_person: number;
  max_transfer_minutes: number;
  dietary_notes: string;
  mobility_notes: string;
  must_do_places: string[];
  avoid_places: string[];
};

export type DraftSlotFeedback = {
  slot_id: string;
  candidate_name: string;
  votes: number;
  vetoed: boolean;
};

export type DraftPlanMetadata = {
  planning_settings: PlanningSettings;
  slot_feedback: DraftSlotFeedback[];
  selection_coverage_ratio: number;
  shared_token?: string;
  shared_count: number;
  shared_at?: string;
};

export type DraftPlan = {
  trip_id: string;
  saved_at: string;
  selections: DraftSelection[];
  metadata: DraftPlanMetadata;
};

export type DraftValidationDay = {
  day: number;
  estimated_cost_per_person: string;
  estimated_cost_value: number;
  transfer_minutes_total: number;
  max_leg_minutes: number;
  warnings: string[];
  route_map_url?: string;
};

export type DraftValidationReport = {
  trip_id: string;
  generated_at: string;
  day_count: number;
  total_estimated_cost_per_person: number;
  days: DraftValidationDay[];
  warnings: string[];
};

export type ShareDraftPlanResponse = {
  share_token: string;
  share_url: string;
};

export type SharedDraftPlanResponse = {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  accommodation_address: string;
  draft_plan: DraftPlan;
  validation: DraftValidationReport;
};

export type AnalyticsSummary = {
  total_trips: number;
  trips_with_saved_draft: number;
  pct_trips_with_saved_draft: number;
  saved_drafts: number;
  saved_drafts_full_slots: number;
  pct_saved_drafts_full_slots: number;
  saved_drafts_shared: number;
  pct_saved_drafts_shared: number;
};
