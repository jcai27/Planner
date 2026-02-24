from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Dict, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


RawActivity = Tuple[str, str, float, int, float, float, int, str, str, str, str]
FAST_FOOD_KEYWORDS = {
    "mcdonald",
    "burger king",
    "kfc",
    "taco bell",
    "wendy's",
    "popeyes",
    "subway",
    "domino",
    "pizza hut",
    "chipotle",
    "five guys",
    "in-n-out",
    "shake shack",
    "dunkin",
    "starbucks",
    "fast food",
}
DISALLOWED_RESTAURANT_TYPES = {
    "meal_takeaway",
    "meal_delivery",
    "convenience_store",
    "gas_station",
}
FREE_CATEGORY_DEFAULTS = {"park", "beach", "hike", "landmark", "relaxation"}
LOW_COST_CATEGORY_DEFAULTS = {"museum", "culture"}
FREE_NAME_HINTS = {
    "park",
    "beach",
    "trail",
    "hike",
    "lookout",
    "viewpoint",
    "promenade",
    "boardwalk",
    "waterfall",
    "garden",
}


@dataclass(frozen=True)
class PlaceTypeConfig:
    google_type: str
    mapped_category: str
    typical_duration_minutes: int


class GooglePlacesClient:
    NEARBY_SEARCH_ENDPOINT = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    PLACE_TYPES = [
        PlaceTypeConfig("restaurant", "food", 90),
        PlaceTypeConfig("bar", "bar", 120),
        PlaceTypeConfig("museum", "museum", 150),
        PlaceTypeConfig("tourist_attraction", "landmark", 120),
        PlaceTypeConfig("park", "park", 90),
        PlaceTypeConfig("spa", "spa", 90),
    ]

    def __init__(
        self,
        api_key: str,
        radius_meters: int = 6000,
        max_results_per_type: int = 8,
        max_total_results: int = 40,
        timeout_seconds: float = 6.0,
        cache_ttl_seconds: int = 6 * 60 * 60,
    ) -> None:
        self.api_key = api_key
        self.radius_meters = radius_meters
        self.max_results_per_type = max_results_per_type
        self.max_total_results = max_total_results
        self.timeout_seconds = timeout_seconds
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cache: Dict[str, tuple[float, List[RawActivity]]] = {}

    def fetch_activities(self, destination: str, lat: float, lng: float) -> List[RawActivity]:
        cache_key = self._cache_key(destination, lat, lng)
        cached = self._cache.get(cache_key)
        now = time.time()
        if cached and (now - cached[0]) < self.cache_ttl_seconds:
            return list(cached[1])

        places_by_id: Dict[str, RawActivity] = {}
        for type_config in self.PLACE_TYPES:
            results = self._nearby_search(lat, lng, type_config.google_type)
            for place in results[: self.max_results_per_type]:
                place_id = place.get("place_id")
                name = place.get("name")
                place_types = {str(t).lower() for t in (place.get("types") or []) if t}
                loc = (place.get("geometry") or {}).get("location") or {}
                place_lat = loc.get("lat")
                place_lng = loc.get("lng")
                if not place_id or not name or place_lat is None or place_lng is None:
                    continue

                if type_config.google_type == "restaurant" and self._is_fast_food_place(str(name), place_types):
                    continue

                rating = float(place.get("rating") or 4.2)
                price_level = self._derive_price_level(
                    raw_price_level=place.get("price_level"),
                    mapped_category=type_config.mapped_category,
                    name=str(name),
                )
                estimated_price = self._price_label(price_level)
                price_confidence = "verified" if place.get("price_level") is not None else "inferred"
                
                activity_url = f"https://www.google.com/maps/search/?api=1&query={place_lat},{place_lng}&query_place_id={place_id}"

                photo_url = ""
                photos = place.get("photos", [])
                if photos and len(photos) > 0:
                    photo_ref = photos[0].get("photo_reference")
                    if photo_ref:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={self.api_key}"

                raw_item: RawActivity = (
                    str(name),
                    type_config.mapped_category,
                    rating,
                    price_level,
                    float(place_lat),
                    float(place_lng),
                    type_config.typical_duration_minutes,
                    photo_url,
                    activity_url,
                    estimated_price,
                    price_confidence,
                )
                existing = places_by_id.get(place_id)
                if not existing or raw_item[2] > existing[2]:
                    places_by_id[place_id] = raw_item

        items = sorted(places_by_id.values(), key=lambda item: item[2], reverse=True)[: self.max_total_results]
        self._cache[cache_key] = (now, items)
        return list(items)

    def _nearby_search(self, lat: float, lng: float, place_type: str) -> List[dict]:
        params = {
            "location": f"{lat},{lng}",
            "radius": self.radius_meters,
            "type": place_type,
            "key": self.api_key,
        }
        url = f"{self.NEARBY_SEARCH_ENDPOINT}?{urlencode(params)}"
        request = Request(url, headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(f"Google Places request failed for type '{place_type}'") from exc

        status = payload.get("status", "")
        if status not in {"OK", "ZERO_RESULTS"}:
            raise RuntimeError(f"Google Places returned status '{status}' for type '{place_type}'")

        return payload.get("results", [])

    @staticmethod
    def _cache_key(destination: str, lat: float, lng: float) -> str:
        return f"{destination.strip().lower()}:{lat:.3f}:{lng:.3f}"

    @staticmethod
    def _is_fast_food_place(name: str, place_types: set[str]) -> bool:
        lowered_name = name.strip().lower()
        if any(keyword in lowered_name for keyword in FAST_FOOD_KEYWORDS):
            return True
        if place_types.intersection(DISALLOWED_RESTAURANT_TYPES):
            return True
        return False

    @staticmethod
    def _price_label(price_level: int) -> str:
        mapping = {
            0: "Free",
            1: "Under $20",
            2: "$20 - $50",
            3: "$50 - $100",
            4: "$100+",
        }
        return mapping.get(price_level, "Varies")

    @staticmethod
    def _derive_price_level(raw_price_level: object, mapped_category: str, name: str) -> int:
        if isinstance(raw_price_level, int):
            return max(0, min(raw_price_level, 4))
        if isinstance(raw_price_level, str) and raw_price_level.isdigit():
            return max(0, min(int(raw_price_level), 4))

        lowered = name.strip().lower()
        if mapped_category in FREE_CATEGORY_DEFAULTS:
            return 0
        if any(hint in lowered for hint in FREE_NAME_HINTS):
            return 0
        if mapped_category in LOW_COST_CATEGORY_DEFAULTS:
            return 1
        if mapped_category in {"food", "restaurant"}:
            return 2
        if mapped_category in {"bar", "nightclub", "spa"}:
            return 3
        return 1
