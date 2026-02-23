"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState("Paris");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lat, setLat] = useState("48.8566");
  const [lng, setLng] = useState("2.3522");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const trip = await api.createTrip({
        destination,
        start_date: startDate,
        end_date: endDate,
        accommodation_lat: Number(lat),
        accommodation_lng: Number(lng)
      });
      router.push(`/trip/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create trip");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <section className="panel fade-up p-8">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-tide">MVP Builder</p>
        <h1 className="font-[var(--font-heading)] text-4xl font-semibold text-ink">AI Group Itinerary Planner</h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Create a trip, add group preferences, and generate packed, balanced, and relaxed plans optimized by interests and location.
        </p>

        <form onSubmit={onSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Destination City
            <input className="rounded-md border border-slate-300 px-3 py-2" value={destination} onChange={(e) => setDestination(e.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm">
            Accommodation Latitude
            <input className="rounded-md border border-slate-300 px-3 py-2" value={lat} onChange={(e) => setLat(e.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm">
            Start Date
            <input type="date" className="rounded-md border border-slate-300 px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm">
            Accommodation Longitude
            <input className="rounded-md border border-slate-300 px-3 py-2" value={lng} onChange={(e) => setLng(e.target.value)} required />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            End Date
            <input type="date" className="rounded-md border border-slate-300 px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-md bg-tide px-4 py-2 font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-50 md:col-span-2"
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Create Trip"}
          </button>
          {error && <p className="md:col-span-2 text-sm text-red-700">{error}</p>}
        </form>
      </section>
    </main>
  );
}
