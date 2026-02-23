from __future__ import annotations

import json
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json"
NOMINATIM_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"

_GOOGLE_LOCATION_TYPE_SCORE = {
    "ROOFTOP": 1.0,
    "RANGE_INTERPOLATED": 0.9,
    "GEOMETRIC_CENTER": 0.75,
    "APPROXIMATE": 0.55,
}


def _http_get_json(url: str, timeout_seconds: float = 6.0) -> Dict[str, Any] | List[Dict[str, Any]]:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "PlannerGeocoder/1.0",
        },
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("Geocoding provider request failed") from exc


def _geocode_with_google(query: str, api_key: str, limit: int) -> List[dict[str, Any]]:
    params = {
        "address": query,
        "key": api_key,
    }
    url = f"{GOOGLE_GEOCODE_ENDPOINT}?{urlencode(params)}"
    payload = _http_get_json(url)
    if not isinstance(payload, dict):
        raise RuntimeError("Invalid Google geocoding response")

    status = payload.get("status", "")
    if status not in {"OK", "ZERO_RESULTS"}:
        raise RuntimeError(f"Google geocoding returned status '{status}'")

    items: List[dict[str, Any]] = []
    for result in payload.get("results", [])[:limit]:
        location = ((result.get("geometry") or {}).get("location") or {})
        lat = location.get("lat")
        lng = location.get("lng")
        if lat is None or lng is None:
            continue

        location_type = ((result.get("geometry") or {}).get("location_type") or "").upper()
        confidence = _GOOGLE_LOCATION_TYPE_SCORE.get(location_type, 0.5)
        if result.get("partial_match"):
            confidence = max(0.0, confidence - 0.2)

        items.append(
            {
                "address": result.get("formatted_address") or query,
                "lat": float(lat),
                "lng": float(lng),
                "provider": "google_geocoding",
                "confidence": float(confidence),
            }
        )
    return items


def _geocode_with_nominatim(query: str, limit: int) -> List[dict[str, Any]]:
    params = {
        "format": "jsonv2",
        "addressdetails": 1,
        "dedupe": 1,
        "limit": max(1, min(limit, 10)),
        "q": query,
    }
    url = f"{NOMINATIM_SEARCH_ENDPOINT}?{urlencode(params)}"
    payload = _http_get_json(url)
    if not isinstance(payload, list):
        raise RuntimeError("Invalid Nominatim geocoding response")

    items: List[dict[str, Any]] = []
    for result in payload[:limit]:
        lat = result.get("lat")
        lng = result.get("lon")
        if lat is None or lng is None:
            continue

        importance = result.get("importance")
        confidence = float(importance) if isinstance(importance, (int, float, str)) else 0.4
        confidence = max(0.0, min(confidence, 1.0))

        items.append(
            {
                "address": result.get("display_name") or query,
                "lat": float(lat),
                "lng": float(lng),
                "provider": "nominatim",
                "confidence": confidence,
            }
        )
    return items


def geocode_address(query: str, google_api_key: str | None, limit: int = 6) -> List[dict[str, Any]]:
    text = query.strip()
    if not text:
        return []

    max_results = max(1, min(limit, 10))
    candidates: List[dict[str, Any]] = []

    if google_api_key:
        try:
            candidates.extend(_geocode_with_google(text, google_api_key, max_results))
        except RuntimeError:
            pass

    if len(candidates) < max_results:
        try:
            candidates.extend(_geocode_with_nominatim(text, max_results))
        except RuntimeError:
            pass

    deduped: List[dict[str, Any]] = []
    seen: set[tuple[float, float]] = set()
    for item in candidates:
        key = (round(float(item["lat"]), 6), round(float(item["lng"]), 6))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= max_results:
            break

    return deduped
