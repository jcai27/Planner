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
  accommodation_lat: number;
  accommodation_lng: number;
  participants: Participant[];
};

export type Activity = {
  name: string;
  category: string;
  rating: number;
  price_level: number;
  latitude: number;
  longitude: number;
  typical_visit_duration: number;
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
