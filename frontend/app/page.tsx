"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState("Paris");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [address, setAddress] = useState("Eiffel Tower, Paris");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error("Failed to contact geocoding service");
      const data = await res.json();

      if (!data || data.length === 0) {
        throw new Error("Address not found. Please try a more specific address or notable landmark.");
      }

      const accommodation_lat = Number(data[0].lat);
      const accommodation_lng = Number(data[0].lon);

      const trip = await api.createTrip({
        destination,
        start_date: startDate,
        end_date: endDate,
        accommodation_address: address,
        accommodation_lat,
        accommodation_lng
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
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel fade-up p-8 md:p-12">
          <p className="badge">Group Itinerary Planner</p>
          <h1 className="hero-title mt-6 text-4xl sm:text-5xl lg:text-6xl">Simple trip planning for groups.</h1>
          <p className="hero-copy mt-4">
            Create one shared workspace, collect preferences from everyone, and generate itinerary options from real places.
          </p>

          <div className="travel-metrics mt-7">
            <article className="metric-card">
              <p className="metric-label">Create</p>
              <p className="metric-value">Trip workspace</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Collect</p>
              <p className="metric-value">Group preferences</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Generate</p>
              <p className="metric-value">3 plan options</p>
            </article>
          </div>
        </section>

        <section className="panel fade-up p-8 md:p-12">
          <h2 className="font-[var(--font-heading)] text-3xl font-bold tracking-tight">Create Trip Base</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This creates your workspace and stores owner access in your browser.
          </p>

          <form onSubmit={onSubmit} className="mt-8 grid gap-6 md:grid-cols-2">
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

            <label className="grid gap-2 md:col-span-2">
              <span className="field-label">Accommodation Address</span>
              <input
                type="text"
                className="field-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 Main St, Central Hotel..."
                required
              />
            </label>

            <button type="submit" className="primary-btn mt-4 md:col-span-2" disabled={isSaving}>
              {isSaving ? "Creating Workspace..." : "Create Trip Workspace"}
            </button>
            {error && <p className="error-text md:col-span-2">{error}</p>}
          </form>
        </section>
      </div>
    </main>
  );
}
