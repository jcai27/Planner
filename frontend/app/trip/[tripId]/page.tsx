"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

  const [trip, setTrip] = useState<Trip | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
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
  }, [tripId]);

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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="panel p-6">
        <h1 className="font-[var(--font-heading)] text-3xl font-semibold">Trip Workspace</h1>
        <p className="mt-2 text-slate-700">Trip ID: <span className="font-mono text-sm">{tripId}</span></p>
        {trip && (
          <p className="mt-2 text-slate-700">
            {trip.destination} | {trip.start_date} to {trip.end_date} | Stay near ({trip.accommodation_lat}, {trip.accommodation_lng})
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="font-[var(--font-heading)] text-2xl">Add Participant</h2>
          <form onSubmit={onJoin} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              Name
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                required
              />
            </label>

            {interestEntries.map(([key, value]) => (
              <label className="grid gap-1 text-sm" key={key}>
                {key[0].toUpperCase() + key.slice(1)}: {value}
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={value}
                  onChange={(e) =>
                    setInterests((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                />
              </label>
            ))}

            <label className="grid gap-1 text-sm">
              Schedule Preference
              <select
                value={schedulePreference}
                onChange={(e) => setSchedulePreference(e.target.value as "packed" | "balanced" | "chill")}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="packed">Packed</option>
                <option value="balanced">Balanced</option>
                <option value="chill">Chill</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Wake Preference
              <select
                value={wakePreference}
                onChange={(e) => setWakePreference(e.target.value as "early" | "normal" | "late")}
                className="rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="early">Early</option>
                <option value="normal">Normal</option>
                <option value="late">Late</option>
              </select>
            </label>

            <button type="submit" className="rounded-md bg-pine px-4 py-2 font-semibold text-white" disabled={busy}>
              Add Participant
            </button>
          </form>

          <h3 className="mt-6 text-lg font-semibold">Current Participants</h3>
          <ul className="mt-2 grid gap-2 text-sm">
            {trip?.participants?.map((p, idx) => (
              <li key={`${p.name}-${idx}`} className="rounded-md border border-slate-200 p-2">
                {p.name} | {p.schedule_preference} pace | {p.wake_preference} wake
              </li>
            ))}
            {!trip?.participants?.length && <li className="text-slate-600">No participants yet.</li>}
          </ul>

          <button
            onClick={onGenerate}
            className="mt-5 rounded-md bg-clay px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy}
          >
            Generate Plans
          </button>
        </div>

        <div className="panel p-6">
          <h2 className="font-[var(--font-heading)] text-2xl">Itinerary Options</h2>
          {!itinerary && <p className="mt-3 text-slate-600">No itinerary generated yet.</p>}

          <div className="mt-4 grid gap-4">
            {itinerary?.options.map((option) => (
              <article key={option.style} className="fade-up rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{option.name}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">Match {option.group_match_score}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{option.explanation}</p>

                <div className="mt-3 grid gap-3">
                  {option.days.map((day) => (
                    <div key={day.day} className="rounded-md bg-slate-50 p-3">
                      <p className="font-semibold">Day {day.day}</p>
                      <ul className="mt-1 text-sm text-slate-700">
                        <li>Morning: {day.morning_activity?.name || "Open"}</li>
                        <li>Afternoon: {day.afternoon_activity?.name || "Open"}</li>
                        <li>Dinner: {day.dinner?.name || "Open"}</li>
                        <li>Evening: {day.evening_option?.name || "Open"}</li>
                      </ul>
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
