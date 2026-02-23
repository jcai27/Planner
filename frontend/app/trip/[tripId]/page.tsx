"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { api } from "@/lib/api";
import { ItineraryResult, InterestVector, Trip } from "@/lib/types";

const defaultInterests: InterestVector = {
  food: 3,
  nightlife: 2,
  culture: 3,
  outdoors: 3,
  relaxation: 2
};

export default function TripPage({ params }: { params: { tripId: string } }) {
  const { tripId } = params;
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");

  const [trip, setTrip] = useState<Trip | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [interests, setInterests] = useState<InterestVector>(defaultInterests);
  const [schedulePreference, setSchedulePreference] = useState<"packed" | "balanced" | "chill">("balanced");
  const [wakePreference, setWakePreference] = useState<"early" | "normal" | "late">("normal");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const interestEntries = useMemo(
    () => Object.entries(interests) as [keyof InterestVector, number][],
    [interests]
  );
  const styleSubtitle: Record<string, string> = {
    packed: "Higher energy days with denser activity blocks",
    balanced: "Even pace across culture, food, and downtime",
    chill: "Lower pressure pacing with lighter transitions"
  };

  useEffect(() => {
    if (inviteToken) {
      api.saveTripAccess(tripId, inviteToken);
    }
    setJoinCode(api.getSavedJoinCode(tripId));
  }, [tripId, inviteToken]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tripData, itineraryData] = await Promise.all([
          api.getTrip(tripId),
          api.getItinerary(tripId).catch(() => null)
        ]);
        setTrip(tripData);
        setItinerary(itineraryData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trip");
      }
    };
    void load();
  }, [tripId, inviteToken]);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await api.joinTrip(tripId, {
        name: participantName,
        interest_vector: interests,
        schedule_preference: schedulePreference,
        wake_preference: wakePreference
      });
      setTrip(updated);
      setParticipantName("");
      setInterests(defaultInterests);
      setSchedulePreference("balanced");
      setWakePreference("normal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add participant");
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    setBusy(true);
    setError("");
    try {
      const generated = await api.generateItinerary(tripId);
      setItinerary(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate itinerary");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="panel fade-up p-6 md:p-8">
        <p className="badge">Trip Workspace</p>
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">Build the Group Plan</h1>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="meta-strip">
            <p className="field-label">Trip ID</p>
            <div className="mono-block mt-1">{tripId}</div>
          </div>
          {joinCode && (
            <div className="meta-strip">
              <p className="field-label">Invite</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Join code: <span className="font-semibold text-[var(--ink)]">{joinCode}</span></p>
              <div className="mono-block mt-1">{`/trip/${tripId}?token=${joinCode}`}</div>
            </div>
          )}
        </div>
        {trip && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            {trip.destination} | {trip.start_date} to {trip.end_date} | Stay near ({trip.accommodation_lat}, {trip.accommodation_lng})
          </p>
        )}
        {error && <p className="error-text mt-3">{error}</p>}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">People + Preferences</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Collect preferences first, then generate options.</p>

          <form onSubmit={onJoin} className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="field-label">Participant Name</span>
              <input
                className="field-input"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                required
              />
            </label>

            <div className="grid gap-3">
              {interestEntries.map(([key, value]) => (
                <label className="rounded-xl border border-[rgba(16,40,58,0.14)] bg-white/70 p-3" key={key}>
                  <div className="flex items-center justify-between">
                    <span className="field-label">{key}</span>
                    <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={value}
                    className="field-input mt-2"
                    onChange={(e) =>
                      setInterests((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="field-label">Schedule Preference</span>
                <select
                  value={schedulePreference}
                  onChange={(e) => setSchedulePreference(e.target.value as "packed" | "balanced" | "chill")}
                  className="field-input"
                >
                  <option value="packed">Packed</option>
                  <option value="balanced">Balanced</option>
                  <option value="chill">Chill</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="field-label">Wake Preference</span>
                <select
                  value={wakePreference}
                  onChange={(e) => setWakePreference(e.target.value as "early" | "normal" | "late")}
                  className="field-input"
                >
                  <option value="early">Early</option>
                  <option value="normal">Normal</option>
                  <option value="late">Late</option>
                </select>
              </label>
            </div>

            <button type="submit" className="primary-btn" disabled={busy}>
              Add Participant
            </button>
          </form>

          <h3 className="mt-7 font-[var(--font-heading)] text-xl font-semibold">Current Participants</h3>
          <ul className="mt-3 grid gap-2 text-sm">
            {trip?.participants?.map((p, idx) => (
              <li key={`${p.name}-${idx}`} className="participant-chip">
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-[var(--muted)]">{p.schedule_preference} pace | {p.wake_preference} wake</p>
              </li>
            ))}
            {!trip?.participants?.length && <li className="text-sm text-[var(--muted)]">No participants yet.</li>}
          </ul>

          <button onClick={onGenerate} className="secondary-btn mt-6 w-full" disabled={busy}>
            {busy ? "Generating..." : "Generate Itinerary Options"}
          </button>
        </div>

        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Itinerary Options</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Each option maps days with different pace and category bias.</p>
          {!itinerary && <p className="mt-5 text-sm text-[var(--muted)]">No itinerary generated yet.</p>}

          <div className="mt-5 grid gap-4">
            {itinerary?.options.map((option) => (
              <article key={option.style} className={`option-card fade-up style-${option.style}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold">{option.name}</h3>
                  <span className="rounded-full border border-[rgba(16,40,58,0.18)] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.07em]">
                    Match {option.group_match_score}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{styleSubtitle[option.style] ?? "Smartly arranged group plan"}</p>
                <div className="score-track">
                  <span className="score-fill" style={{ width: `${option.group_match_score}%` }} />
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">{option.explanation}</p>

                <div className="mt-4 grid gap-3">
                  {option.days.map((day) => (
                    <div key={day.day} className="rounded-xl border border-[rgba(16,40,58,0.12)] bg-[rgba(255,255,255,0.78)] p-3">
                      <p className="font-[var(--font-heading)] text-lg font-semibold">Day {day.day}</p>
                      <div className="day-grid">
                        <div className="slot">
                          <p className="slot-label">Morning</p>
                          <p className="slot-value">{day.morning_activity?.name || "Open"}</p>
                        </div>
                        <div className="slot">
                          <p className="slot-label">Afternoon</p>
                          <p className="slot-value">{day.afternoon_activity?.name || "Open"}</p>
                        </div>
                        <div className="slot">
                          <p className="slot-label">Dinner</p>
                          <p className="slot-value">{day.dinner?.name || "Open"}</p>
                        </div>
                        <div className="slot">
                          <p className="slot-label">Evening</p>
                          <p className="slot-value">{day.evening_option?.name || "Open"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
