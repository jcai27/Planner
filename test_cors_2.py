import urllib.request
from urllib.error import HTTPError

# Test GET trip (returns 404 since trip is not found)
req = urllib.request.Request(
    'https://planner-h514.onrender.com/trip/ae2c6669-2bd6-475a-a9c6-1674059e044f', 
    headers={'Origin': 'https://planner-sepia-alpha.vercel.app'}
)
try:
    urllib.request.urlopen(req)
except HTTPError as e:
    print(f"GET returned status {e.code}")
    print(e.headers)
