import urllib.request
from urllib.error import HTTPError

# Test GET trip with a fake token to pass 401 but hit 404 "Trip not found"
req = urllib.request.Request(
    'https://planner-h514.onrender.com/trip/fake-trip-id', 
    headers={
        'Origin': 'https://planner-sepia-alpha.vercel.app',
        'X-Trip-Token': 'fake-token'
    }
)
try:
    urllib.request.urlopen(req)
except HTTPError as e:
    print(f"GET returned status {e.code}")
    print(e.headers)
