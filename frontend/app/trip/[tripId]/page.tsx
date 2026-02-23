"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { api } from "@/lib/api";
import { ItineraryResult, InterestVector, Trip } from "@/lib/types";

const defaultInterests: InterestVector = {
  food: 3,
  nightlife: 2,
  culture: 3,
  outdoors: 3,
  relaxation: 2
};

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
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
        <h1 className="hero-title mt-4 text-3xl sm:text-4xl">
          {trip?.destination ? `${trip.destination} plan` : "Build your group plan"}
        </h1>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="meta-strip">
            <p className="field-label">Trip ID</p>
            <div className="mono-block mt-1">{tripId}</div>
          </div>
          {trip && (
            <div className="meta-strip">
              <p className="field-label">Dates</p>
              <p className="mt-1 text-sm text-[var(--ink)]">
                {trip.start_date} to {trip.end_date}
              </p>
            </div>
          )}
          {joinCode && (
            <div className="meta-strip">
              <p className="field-label">Invite Code</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{joinCode}</p>
              <div className="mono-block mt-1">{`/trip/${tripId}?token=${joinCode}`}</div>
            </div>
          )}
        </div>

        {trip && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Accommodation coordinates: {trip.accommodation_lat}, {trip.accommodation_lng}
          </p>
        )}
        {error && <p className="error-text mt-3">{error}</p>}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel fade-up p-6 md:p-7">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold">Participants</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Add everyone first, then generate itinerary options.</p>

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
                <label className="metric-card" key={key}>
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
                <p className="font-semibold text-[var(--ink)]">{p.name}</p>
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
          <p className="mt-2 text-sm text-[var(--muted)]">Three pacing styles generated from real nearby places.</p>
          {!itinerary && <p className="mt-5 text-sm text-[var(--muted)]">No itinerary generated yet.</p>}

          <div className="mt-5 grid gap-4">
            {itinerary?.options.map((option) => (
              <article key={option.style} className={`option-card fade-up style-${option.style}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-[var(--font-heading)] text-xl font-semibold">{option.name}</h3>
                  <span className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.07em]">
                    Match {option.group_match_score}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                  {styleSubtitle[option.style] ?? "Smartly arranged group plan"}
                </p>
                <div className="score-track">
                  <span className="score-fill" style={{ width: `${option.group_match_score}%` }} />
                </div>
                <p className="mt-3 text-sm text-[var(--muted)]">{option.explanation}</p>

                <div className="mt-5 grid gap-5">
                  {option.days.map((day) => (
                    <div key={day.day} className="rounded-xl border border-[var(--line-strong)] bg-[var(--surface-soft)] p-5">
                      <h4 className="font-[var(--font-heading)] text-xl font-bold">Day {day.day}</h4>
                      <div className="mt-4 grid gap-4">
                        {[
                          { label: "Morning", activity: day.morning_activity },
                          { label: "Afternoon", activity: day.afternoon_activity },
                          { label: "Dinner", activity: day.dinner },
                          { label: "Evening", activity: day.evening_option },
                        ].map((slot) => (
                          <div key={slot.label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm hover:shadow-md transition-shadow">
                            {!slot.activity ? (
                              <div className="flex items-center gap-3 opacity-50">
                                <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">{slot.label}</span>
                                <span className="text-sm font-medium text-[var(--muted)]">Open time</span>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">{slot.label}</span>
                                    <h4 className="font-semibold text-[var(--ink)] text-lg">{slot.activity.name}</h4>
                                  </div>
                                  <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] border border-[var(--line-strong)] capitalize">
                                    {slot.activity.category}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-4 text-xs font-medium text-[var(--muted)]">
                                  <span>⭐ {slot.activity.rating.toFixed(1)}</span>
                                  <span>{Array(Math.max(1, slot.activity.price_level)).fill('$').join('')}</span>
                                </div>
                                {slot.activity.explanation && (
                                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{slot.activity.explanation}</p>
                                )}
                              </>
                            )}
                          </div>
                        ))}
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
