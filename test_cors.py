import urllib.request
from urllib.error import HTTPError

# Test GET itinerary (returns 404 since trip is not ready/found)
req = urllib.request.Request(
    'https://planner-h514.onrender.com/trip/ae2c6669-2bd6-475a-a9c6-1674059e044f/itinerary', 
    headers={'Origin': 'https://planner-sepia-alpha.vercel.app'}
)
try:
    urllib.request.urlopen(req)
except HTTPError as e:
    print(f"GET returned status {e.code}")
    print(e.headers)

# Test POST join (returns 404 since trip is not found or 401 without token)
req_join = urllib.request.Request(
    'https://planner-h514.onrender.com/trip/ae2c6669-2bd6-475a-a9c6-1674059e044f/join', 
    headers={'Origin': 'https://planner-sepia-alpha.vercel.app'},
    method='POST'
)
try:
    urllib.request.urlopen(req_join)
except HTTPError as e:
    print(f"POST returned status {e.code}")
    print(e.headers)
