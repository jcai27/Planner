import urllib.request
from urllib.error import HTTPError

req = urllib.request.Request(
    'https://planner-h514.onrender.com/trip/696bab42-c280-404c-8457-b2bcab82f3b4', 
    headers={
        'Origin': 'https://planner-sepia-alpha.vercel.app',
        'x-trip-token': 'token'
    }
)
try:
    urllib.request.urlopen(req)
except HTTPError as e:
    print(f"status {e.code}")
    print(e.headers)
