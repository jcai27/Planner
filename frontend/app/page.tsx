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
      api.saveTripAccess(trip.id, trip.owner_token, trip.join_code);
      router.push(`/trip/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create trip");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="panel fade-up p-7 md:p-10">
          <p className="badge">Group Itinerary Studio</p>
          <h1 className="hero-title mt-5 text-4xl sm:text-5xl lg:text-[3.35rem]">
            Plan Once.
            <br />
            Make Everyone Happy.
          </h1>
          <p className="hero-copy mt-5">
            Build one shared trip hub, collect each person&apos;s preferences, and generate three realistic plans from real nearby places.
            It is fast enough for planning chats and structured enough for a real trip.
          </p>

          <div className="travel-metrics mt-7">
            <article className="metric-card">
              <p className="metric-label">Plan Styles</p>
              <p className="metric-value">3 Distinct</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Live Places</p>
              <p className="metric-value">Google Data</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Shared Access</p>
              <p className="metric-value">Invite Token</p>
            </article>
          </div>

          <div className="mt-7 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
            <p className="rounded-xl border border-[rgba(16,40,58,0.14)] bg-white/70 px-3 py-2">1. Create trip base</p>
            <p className="rounded-xl border border-[rgba(16,40,58,0.14)] bg-white/70 px-3 py-2">2. Add participant tastes</p>
            <p className="rounded-xl border border-[rgba(16,40,58,0.14)] bg-white/70 px-3 py-2">3. Generate daily options</p>
          </div>
        </section>

        <section className="panel fade-up p-7 md:p-8">
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold tracking-tight">Create Trip Base</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">This creates your workspace and saves private access credentials locally.</p>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 md:col-span-2">
              <span className="field-label">Destination City</span>
              <input className="field-input" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            </label>

            <label className="grid gap-2">
              <span className="field-label">Start Date</span>
              <input type="date" className="field-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>

            <label className="grid gap-2">
              <span className="field-label">End Date</span>
              <input type="date" className="field-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>

            <label className="grid gap-2">
              <span className="field-label">Accommodation Latitude</span>
              <input
                type="number"
                step="any"
                className="field-input"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="field-label">Accommodation Longitude</span>
              <input
                type="number"
                step="any"
                className="field-input"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                required
              />
            </label>

            <button type="submit" className="primary-btn mt-1 md:col-span-2" disabled={isSaving}>
              {isSaving ? "Creating Workspace..." : "Create Trip Workspace"}
            </button>
            {error && <p className="error-text md:col-span-2">{error}</p>}
          </form>
        </section>
      </div>
    </main>
  );
}
