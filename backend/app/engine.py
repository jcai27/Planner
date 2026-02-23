from __future__ import annotations

import math
import os
import urllib.parse
from collections import Counter
from datetime import datetime
from typing import Dict, Iterable, List

import numpy as np
from openai import OpenAI

from .places_client import GooglePlacesClient
from .schemas import (
    Activity,
    DayPlan,
    DraftSchedule,
    DraftSlot,
    DraftSlotName,
    INTEREST_KEYS,
    ItineraryOption,
    ItineraryResult,
    Participant,
    Trip,
    WakePreference,
)

CATEGORY_TO_INTEREST = {
    "food": "food",
    "restaurant": "food",
    "bar": "nightlife",
    "nightclub": "nightlife",
    "museum": "culture",
    "landmark": "culture",
    "park": "outdoors",
    "hike": "outdoors",
    "spa": "relaxation",
    "beach": "relaxation",
}

STYLE_SETTINGS = {
    "packed": {"max_activities": 4, "distance_weight": 1.0, "downtime": 0.0},
    "balanced": {"max_activities": 3, "distance_weight": 1.1, "downtime": 0.1},
    "chill": {"max_activities": 2, "distance_weight": 1.3, "downtime": 0.25},
}
SLOT_CATEGORY_PRIORITIES: dict[DraftSlotName, set[str]] = {
    DraftSlotName.morning: {"museum", "park", "landmark", "culture", "hike", "food", "restaurant"},
    DraftSlotName.afternoon: {"food", "restaurant", "museum", "park", "landmark", "culture", "spa"},
    DraftSlotName.evening: {"bar", "nightclub", "relaxation", "spa", "food", "restaurant", "landmark"},
}

STATIC_ACTIVITY_LIBRARY = {
    "new york": [
        ("Chelsea Market", "food", 4.7, 2, 40.7424, -74.0060, 90, "https://images.unsplash.com/photo-1546411516-72879ef7bf8d?w=800&q=80"),
        ("Metropolitan Museum of Art", "museum", 4.8, 3, 40.7794, -73.9632, 150, "https://images.unsplash.com/photo-1545624783-a912bb31c9a0?w=800&q=80"),
        ("Central Park Loop", "park", 4.8, 0, 40.7812, -73.9665, 120, "https://images.unsplash.com/photo-1498144846853-6cc3a433230a?w=800&q=80"),
        ("Brooklyn Bridge Walk", "landmark", 4.7, 0, 40.7061, -73.9969, 90, "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80"),
        ("Williamsburg Rooftop", "bar", 4.6, 3, 40.7188, -73.9570, 120, "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80"),
        ("SoHo Food Crawl", "restaurant", 4.6, 2, 40.7233, -74.0030, 120, "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80"),
        ("Prospect Park Picnic", "relaxation", 4.6, 1, 40.6602, -73.9690, 120, "https://images.unsplash.com/photo-1506501139174-099022df5260?w=800&q=80"),
    ],
    "paris": [
        ("Louvre Museum", "museum", 4.8, 3, 48.8606, 2.3376, 180, "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80"),
        ("Le Marais Food Walk", "food", 4.7, 2, 48.8578, 2.3622, 120, "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80"),
        ("Seine Sunset Cruise", "relaxation", 4.6, 3, 48.8584, 2.2945, 90, "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80"),
        ("Montmartre Streets", "culture", 4.6, 1, 48.8867, 2.3431, 120, "https://images.unsplash.com/photo-1522083111812-dbfbc72b226e?w=800&q=80"),
        ("Luxembourg Gardens", "park", 4.7, 0, 48.8462, 2.3371, 90, "https://images.unsplash.com/photo-1581404179352-87db3bb75de5?w=800&q=80"),
        ("Latin Quarter Jazz Bar", "bar", 4.5, 2, 48.8493, 2.3470, 120, "https://images.unsplash.com/photo-1543362906-acfc16c67564?w=800&q=80"),
    ],
    "tokyo": [
        ("Tsukiji Outer Market", "food", 4.7, 2, 35.6655, 139.7708, 120, "https://images.unsplash.com/photo-1528151528657-8ba2baf8ce16?w=800&q=80"),
        ("Meiji Shrine", "culture", 4.7, 1, 35.6764, 139.6993, 90, "https://images.unsplash.com/photo-1531518326284-95438ee2b8af?w=800&q=80"),
        ("Shinjuku Gyoen", "park", 4.7, 1, 35.6852, 139.7100, 120, "https://images.unsplash.com/photo-1558862141-8631bfa2a912?w=800&q=80"),
        ("Shibuya Night Crawl", "nightclub", 4.6, 3, 35.6595, 139.7005, 150, "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80"),
        ("Asakusa Temple District", "landmark", 4.7, 1, 35.7148, 139.7967, 120, "https://images.unsplash.com/photo-1554797589-7241f4bade8f?w=800&q=80"),
        ("Odaiba Onsen Style Spa", "spa", 4.5, 3, 35.6142, 139.7768, 120, "https://images.unsplash.com/photo-1544465544-1b71aee9dfa3?w=800&q=80"),
    ],
}


class ItineraryEngine:
    def __init__(self) -> None:
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None
        google_places_key = os.getenv("GOOGLE_PLACES_API_KEY")
        self.google_places_client = (
            GooglePlacesClient(
                api_key=google_places_key,
                radius_meters=int(os.getenv("GOOGLE_PLACES_RADIUS_METERS", "6000")),
                max_results_per_type=int(os.getenv("GOOGLE_PLACES_MAX_RESULTS_PER_TYPE", "8")),
                max_total_results=int(os.getenv("GOOGLE_PLACES_MAX_TOTAL_RESULTS", "40")),
                timeout_seconds=float(os.getenv("GOOGLE_PLACES_TIMEOUT_SECONDS", "6")),
                cache_ttl_seconds=int(os.getenv("GOOGLE_PLACES_CACHE_TTL_SECONDS", str(6 * 60 * 60))),
            )
            if google_places_key
            else None
        )

    def generate(self, trip: Trip) -> ItineraryResult:
        if not trip.participants:
            raise ValueError("At least one participant is required to generate itinerary")

        group_interest_vector = self._aggregate_interests(trip.participants)
        energy_profile = Counter([p.schedule_preference for p in trip.participants])
        wake_profile = Counter([p.wake_preference for p in trip.participants])

        activities = self._fetch_activities(trip.destination, trip.accommodation_lat, trip.accommodation_lng)
        day_count = (trip.end_date - trip.start_date).days + 1
        options: List[ItineraryOption] = []
        for name, style in [
            ("Packed Experience", "packed"),
            ("Balanced Exploration", "balanced"),
            ("Relaxed Trip", "chill"),
        ]:
            scored = self._score_activities(activities, group_interest_vector, trip, wake_profile, style)
            clustered = self._cluster_by_geo(scored, day_count)
            options.append(
                self._build_option(
                    name,
                    style,
                    clustered,
                    group_interest_vector,
                    energy_profile,
                    wake_profile,
                    trip,
                )
            )

        return ItineraryResult(
            trip_id=trip.id,
            generated_at=datetime.utcnow().isoformat(),
            options=options,
        )

    def generate_slot_draft(self, trip: Trip, choices_per_slot: int = 4) -> DraftSchedule:
        if not trip.participants:
            raise ValueError("At least one participant is required before drafting schedule slots")

        slots_per_day = [DraftSlotName.morning, DraftSlotName.afternoon, DraftSlotName.evening]
        candidate_count = max(3, min(choices_per_slot, 4))

        group_interest_vector = self._aggregate_interests(trip.participants)
        wake_profile = Counter([p.wake_preference for p in trip.participants])
        schedule_profile = Counter([p.schedule_preference for p in trip.participants])
        dominant_style = schedule_profile.most_common(1)[0][0]

        activities = self._fetch_activities(trip.destination, trip.accommodation_lat, trip.accommodation_lng)
        scored = self._score_activities(activities, group_interest_vector, trip, wake_profile, dominant_style)
        day_count = (trip.end_date - trip.start_date).days + 1

        if not scored:
            return DraftSchedule(trip_id=trip.id, generated_at=datetime.utcnow().isoformat(), slots=[])

        slots: List[DraftSlot] = []
        primary_used_names: set[str] = set()

        for day in range(1, day_count + 1):
            for slot_name in slots_per_day:
                ranked = self._rank_slot_candidates(scored, slot_name, primary_used_names)
                candidates = [activity.model_copy() for activity, _ in ranked[:candidate_count]]
                if not candidates:
                    continue

                primary_used_names.add(candidates[0].name)
                slots.append(
                    DraftSlot(
                        slot_id=f"day-{day}-{slot_name.value}",
                        day=day,
                        slot=slot_name,
                        candidates=candidates,
                    )
                )

        return DraftSchedule(
            trip_id=trip.id,
            generated_at=datetime.utcnow().isoformat(),
            slots=slots,
        )

    def _aggregate_interests(self, participants: Iterable[Participant]) -> Dict[str, float]:
        counts = {k: 0.0 for k in INTEREST_KEYS}
        participants = list(participants)
        for participant in participants:
            for key, value in participant.interest_vector.as_dict().items():
                counts[key] += value
        size = max(1, len(participants))
        return {k: v / size for k, v in counts.items()}

    def _fetch_activities(self, destination: str, base_lat: float, base_lng: float) -> List[Activity]:
        raw = None
        if self.google_places_client:
            try:
                raw = self.google_places_client.fetch_activities(destination, base_lat, base_lng)
            except Exception:
                raw = None

        if not raw:
            city_key = destination.strip().lower()
            raw = STATIC_ACTIVITY_LIBRARY.get(city_key)
        if not raw:
            raw = self._fallback_activity_set(base_lat, base_lng)
            
        res = []
        for item in raw:
            name, category, rating, price, lat, lng, duration = item[:7]
            image_url = item[7] if len(item) > 7 else None
            activity_url = item[8] if len(item) > 8 else f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(name)}"
            
            price_mapping = {0: "Free", 1: "Under $20", 2: "$20 - $50", 3: "$50 - $100", 4: "$100+"}
            estimated_price = item[9] if len(item) > 9 else price_mapping.get(price, "$20 - $50")
            
            res.append(Activity(
                name=name, category=category, rating=rating, price_level=price,
                latitude=lat, longitude=lng, typical_visit_duration=duration,
                image_url=image_url, activity_url=activity_url, estimated_price=estimated_price
            ))
            
        return res

    def _fallback_activity_set(self, base_lat: float, base_lng: float):
        return [
            ("Neighborhood Food Hall", "food", 4.4, 2, base_lat + 0.010, base_lng + 0.010, 90, "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80"),
            ("City History Museum", "museum", 4.5, 2, base_lat - 0.012, base_lng + 0.008, 120, "https://images.unsplash.com/photo-1545624783-a912bb31c9a0?w=800&q=80"),
            ("Riverside Park", "park", 4.6, 0, base_lat + 0.008, base_lng - 0.012, 90, "https://images.unsplash.com/photo-1498144846853-6cc3a433230a?w=800&q=80"),
            ("Old Town Walking Route", "landmark", 4.5, 1, base_lat - 0.015, base_lng - 0.010, 120, "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80"),
            ("Sunset Lounge", "bar", 4.3, 3, base_lat + 0.005, base_lng + 0.018, 120, "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80"),
            ("Urban Wellness Spa", "spa", 4.4, 3, base_lat - 0.009, base_lng + 0.014, 90, "https://images.unsplash.com/photo-1544465544-1b71aee9dfa3?w=800&q=80"),
            ("Local Bistro", "restaurant", 4.5, 2, base_lat + 0.002, base_lng - 0.006, 90, "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80"),
        ]

    def _score_activities(
        self,
        activities: List[Activity],
        group_interest_vector: Dict[str, float],
        trip: Trip,
        wake_profile: Counter,
        style: str,
    ) -> List[tuple[Activity, float]]:
        settings = STYLE_SETTINGS[style]
        results: List[tuple[Activity, float]] = []
        wake_mode = wake_profile.most_common(1)[0][0]
        wake_multiplier = {WakePreference.early: 1.0, WakePreference.normal: 0.9, WakePreference.late: 0.8}[wake_mode]

        for activity in activities:
            interest_key = CATEGORY_TO_INTEREST.get(activity.category, "culture")
            preference_match = group_interest_vector.get(interest_key, 2.5) / 5.0
            rating_weight = activity.rating / 5.0
            distance_km = self._haversine_km(
                trip.accommodation_lat,
                trip.accommodation_lng,
                activity.latitude,
                activity.longitude,
            )
            distance_penalty = 1 / (1 + (distance_km / 5) * settings["distance_weight"])
            time_of_day_fit = wake_multiplier if activity.category in {"museum", "park", "landmark"} else 1.0
            duration_load = min(1.0, activity.typical_visit_duration / 240)
            downtime_penalty = max(0.6, 1 - settings["downtime"] * duration_load)
            style_bias = self._style_activity_bias(style, activity.category)

            score = preference_match * rating_weight * distance_penalty * time_of_day_fit * downtime_penalty * style_bias
            results.append((activity, score))

        return sorted(results, key=lambda x: x[1], reverse=True)

    def _cluster_by_geo(self, scored_activities: List[tuple[Activity, float]], k: int):
        activities = [item[0] for item in scored_activities]
        scores = {item[0].name: item[1] for item in scored_activities}
        if k <= 1:
            return [sorted(activities, key=lambda a: scores[a.name], reverse=True)]
        if len(activities) <= k:
            ordered = sorted(activities, key=lambda a: scores[a.name], reverse=True)
            clusters = [[activity] for activity in ordered]
            clusters.extend([[] for _ in range(k - len(clusters))])
            return clusters

        coords = np.array([[a.latitude, a.longitude] for a in activities])
        centroids = coords[:k].copy()

        for _ in range(8):
            distances = np.linalg.norm(coords[:, np.newaxis] - centroids[np.newaxis, :], axis=2)
            assignments = distances.argmin(axis=1)
            new_centroids = np.array(
                [coords[assignments == i].mean(axis=0) if np.any(assignments == i) else centroids[i] for i in range(k)]
            )
            if np.allclose(centroids, new_centroids):
                break
            centroids = new_centroids

        clusters = [[] for _ in range(k)]
        for idx, activity in enumerate(activities):
            cluster_id = int(np.linalg.norm(coords[idx] - centroids, axis=1).argmin())
            clusters[cluster_id].append(activity)

        for idx in range(len(clusters)):
            clusters[idx] = sorted(clusters[idx], key=lambda a: scores.get(a.name, 0), reverse=True)
        return clusters

    def _rank_slot_candidates(
        self,
        scored_activities: List[tuple[Activity, float]],
        slot_name: DraftSlotName,
        primary_used_names: set[str],
    ) -> List[tuple[Activity, float]]:
        preferred_categories = SLOT_CATEGORY_PRIORITIES[slot_name]
        ranked: List[tuple[Activity, float]] = []

        def slot_multiplier(activity: Activity) -> float:
            multiplier = 1.2 if activity.category in preferred_categories else 0.92
            if slot_name == DraftSlotName.morning and activity.category in {"bar", "nightclub"}:
                multiplier *= 0.75
            if slot_name == DraftSlotName.evening and activity.category in {"museum", "landmark", "culture"}:
                multiplier *= 0.88
            return multiplier

        seen_names: set[str] = set()

        for activity, score in scored_activities:
            if activity.name in primary_used_names:
                continue
            seen_names.add(activity.name)
            ranked.append((activity, score * slot_multiplier(activity)))

        ranked.sort(key=lambda item: item[1], reverse=True)

        if len(ranked) >= 4:
            return ranked

        for activity, score in scored_activities:
            if activity.name in seen_names:
                continue
            seen_names.add(activity.name)
            ranked.append((activity, score * slot_multiplier(activity)))

        ranked.sort(key=lambda item: item[1], reverse=True)
        return ranked

    def _build_option(
        self,
        name: str,
        style: str,
        clusters: List[List[Activity]],
        group_interest_vector: Dict[str, float],
        energy_profile: Counter,
        wake_profile: Counter,
        trip: Trip,
    ) -> ItineraryOption:
        settings = STYLE_SETTINGS[style]
        days: List[DayPlan] = []
        max_acts = settings["max_activities"]

        all_chosen = []

        for day_index, day_activities in enumerate(clusters, start=1):
            selected = day_activities[:max_acts]
            morning = self._pick_first(selected, {"museum", "park", "landmark", "culture"})
            afternoon = self._pick_first(selected, {"food", "restaurant", "park", "hike"}, exclude={morning.name} if morning else set())
            dinner_exclude = {x.name for x in [morning, afternoon] if x}
            dinner = self._pick_first(selected, {"food", "restaurant"}, exclude=dinner_exclude)
            evening = self._pick_first(
                selected,
                {"bar", "nightclub", "relaxation", "spa"},
                exclude={x.name for x in [morning, afternoon, dinner] if x},
            )

            for a in (morning, afternoon, dinner, evening):
                if a and a not in all_chosen:
                    all_chosen.append(a)

            days.append(
                DayPlan(
                    day=day_index,
                    morning_activity=morning,
                    afternoon_activity=afternoon,
                    dinner=dinner,
                    evening_option=evening,
                )
            )

        activity_scores = self._score_activities(all_chosen, group_interest_vector, trip, wake_profile, style)
        if activity_scores:
            avg_score = sum(score for _, score in activity_scores) / len(activity_scores)
            match_score = min(100.0, avg_score * 125.0)
        else:
            match_score = 50.0

        explanation = self._explain_plan(name, style, group_interest_vector, energy_profile, wake_profile, trip)

        explanations_map = self._explain_activities(all_chosen, style, group_interest_vector, trip)

        for day in days:
            if day.morning_activity:
                day.morning_activity = day.morning_activity.model_copy(update={"explanation": explanations_map.get(day.morning_activity.name, "")})
            if day.afternoon_activity:
                day.afternoon_activity = day.afternoon_activity.model_copy(update={"explanation": explanations_map.get(day.afternoon_activity.name, "")})
            if day.dinner:
                day.dinner = day.dinner.model_copy(update={"explanation": explanations_map.get(day.dinner.name, "")})
            if day.evening_option:
                day.evening_option = day.evening_option.model_copy(update={"explanation": explanations_map.get(day.evening_option.name, "")})

        return ItineraryOption(
            name=name,
            style=style,
            group_match_score=round(match_score, 1),
            explanation=explanation,
            days=days,
        )

    def _explain_plan(
        self,
        plan_name: str,
        style: str,
        group_interest_vector: Dict[str, float],
        energy_profile: Counter,
        wake_profile: Counter,
        trip: Trip,
    ) -> str:
        top_interest = max(group_interest_vector.items(), key=lambda x: x[1])[0]
        dominant_energy = energy_profile.most_common(1)[0][0]
        dominant_wake = wake_profile.most_common(1)[0][0]

        fallback = (
            f"{plan_name} prioritizes {top_interest} while fitting a {dominant_energy} pace "
            f"and {dominant_wake}-start days. Activities are grouped near your stay in {trip.destination} "
            "to reduce cross-city travel and keep days cohesive."
        )

        if not self.openai_client:
            return fallback

        prompt = (
            "Write 1-2 sentences explaining this itinerary option for a group trip. "
            f"Plan: {plan_name} ({style}). Destination: {trip.destination}. "
            f"Top interest: {top_interest}. Energy profile: {dict(energy_profile)}. "
            f"Wake profile: {dict(wake_profile)}. Keep it practical and concise."
        )
        try:
            completion = self.openai_client.chat.completions.create(
                model=os.getenv("OPENAI_EXPLANATION_MODEL", "gpt-4o-mini"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
            )
            text = completion.choices[0].message.content.strip()
            return text or fallback
        except Exception as e:
            print(f"Explanation error: {e}")
            return fallback

    def _explain_activities(self, activities: List[Activity], style: str, group_interest_vector: Dict[str, float], trip: Trip) -> Dict[str, str]:
        if not self.openai_client or not activities:
            return {}

        top_interest = max(group_interest_vector.items(), key=lambda x: x[1])[0]
        activity_names = [a.name for a in activities]
        prompt = (
            f"For a group trip to {trip.destination} with a focus on {top_interest} and pacing style '{style}', "
            "provide a 1-2 sentence explanation for why each of the following places was chosen and what it is. "
            f"Places: {', '.join(activity_names)}. "
            "Return the result vertically, with each explanation on a new line starting with 'PLACE_NAME: '."
        )

        try:
            completion = self.openai_client.chat.completions.create(
                model=os.getenv("OPENAI_EXPLANATION_MODEL", "gpt-4o-mini"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1000,
            )
            text = completion.choices[0].message.content.strip()
            
            explanations = {}
            for line in text.split('\n'):
                if ': ' in line:
                    name, expl = line.split(': ', 1)
                    name = name.strip()
                    if name.startswith('- '):
                        name = name[2:]
                    if name.startswith('*'):
                        name = name.replace('*', '')
                    explanations[name] = expl.strip()
            
            result = {}
            for a in activities:
                match = explanations.get(a.name)
                if not match:
                    for k, v in explanations.items():
                        if k in a.name or a.name in k:
                            match = v
                            break
                result[a.name] = match or f"A great {a.category} option for the group in {trip.destination}."
            return result
        except Exception as e:
            print(f"Activities explanation error: {e}")
            return {a.name: f"A great {a.category} option for the group in {trip.destination}." for a in activities}

    @staticmethod
    def _pick_first(activities: List[Activity], categories: set[str], exclude: set[str] | None = None):
        exclude = exclude or set()
        for activity in activities:
            if activity.category in categories and activity.name not in exclude:
                return activity
        for activity in activities:
            if activity.name not in exclude:
                return activity
        return None

    @staticmethod
    def _style_activity_bias(style: str, category: str) -> float:
        if style == "packed":
            if category in {"museum", "landmark", "culture", "nightclub", "bar"}:
                return 1.12
            if category in {"spa", "relaxation", "beach"}:
                return 0.93
        elif style == "chill":
            if category in {"spa", "relaxation", "park", "beach"}:
                return 1.15
            if category in {"nightclub", "bar"}:
                return 0.85
        return 1.0

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r = 6371
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c
