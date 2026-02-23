# AI Group Itinerary Planner (MVP)

Minimal full-stack implementation of the MVP spec:
- FastAPI backend for trip + participant + itinerary APIs
- Next.js + Tailwind frontend for create/join/generate/view flow
- Itinerary engine with preference aggregation, scoring, geo clustering, and 3 plan styles

## Project structure

- `backend/` FastAPI API and itinerary generation logic
- `frontend/` Next.js app router UI

## Backend run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional LLM explanations:
1. copy `backend/.env.example` to `backend/.env`
2. set `DATABASE_URL` for Postgres/Supabase (or omit for local SQLite `planner.db`)
3. set `OPENAI_API_KEY` (optional)
4. set `CORS_ALLOW_ORIGINS` (comma-separated origins; defaults to `http://localhost:3000`)
5. set `GOOGLE_PLACES_API_KEY` to pull real places/activities from Google Places (optional but recommended)

## Database migrations (Alembic)

```bash
cd backend
alembic upgrade head
```

Create a new migration after model changes:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Frontend run

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Implemented endpoints

- `POST /trip/create` (returns `owner_token` and `join_code`)
- `POST /trip/{id}/join` (requires header `X-Trip-Token`)
- `GET /trip/{id}` (requires header `X-Trip-Token`)
- `POST /trip/{id}/generate_itinerary` (requires header `X-Trip-Token`)
- `GET /trip/{id}/itinerary` (requires header `X-Trip-Token`)

## Notes

- Persistence now uses SQLAlchemy with `DATABASE_URL` (Postgres/Supabase-ready).
- If `DATABASE_URL` is not set, backend falls back to local SQLite (`backend/planner.db`).
- Activity retrieval uses Google Places when `GOOGLE_PLACES_API_KEY` is set; otherwise it falls back to a curated static dataset.
- Explanation layer uses OpenAI only if key is provided; otherwise deterministic summary text is returned.

## Tests

```bash
cd backend
python -m pytest -q
```
