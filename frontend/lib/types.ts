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

export type DraftPlan = {
  trip_id: string;
  saved_at: string;
  selections: DraftSelection[];
};
